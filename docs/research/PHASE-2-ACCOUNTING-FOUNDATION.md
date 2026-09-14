# Phase 2 accounting foundation

**Research date:** 2026-08-15
**Scope:** Optional, single-table, in-person, play-chip No-Limit Texas Hold'em. This foundation does not authorize real-money play, tournament rules, or remote human play.

## Executive conclusion

The first digital-accounting profile uses integer play chips, small and big blinds only, host-confirmed settlement, clockwise odd-chip allocation beginning left of the dealer button, top-ups only between hands, and wait-for-big-blind re-entry. These choices are bundled as `p2-house-1`. They are research defaults, not claims that all poker rooms use the same house rules.

The implementation begins with a heads-up tracer hand through the existing Trusted Host command/receipt boundary. Multiway short all-ins, nested side pots, ledger corrections, top-ups, history export, and release qualification remain later tickets.

## Evidence

### Facts

- The [Poker TDA rules](https://www.pokertda.com/view-poker-tda-rules/) define side pots separately, award an odd chip to the first seat left of the button in flop games, and require a clear dispute window before the next hand becomes binding.
- The [Singapore Gambling Regulatory Authority's RWS poker-rules index](https://www.gra.gov.sg/licenses-approvals/regulatory-approvals-for-casino-operators-and-businesses/game-rules-for-casinos%28rws%29/game-rules/poker-games-%28rws%29) publishes No Limit Hold'em (RWS) Version 10, effective 3 July 2026. Its rules describe the two-blind structure, heads-up exceptions, and missed-blind handling. These are regulated-card-room rules, not automatically binding product requirements for a private home game.
- [SmartDealer](https://smartdealer.poker/) advertises a dealer-assisted home-poker product that tracks actions and pots while keeping cards and physical interaction at the table. This is evidence of an industrial interaction pattern, not evidence of its internal implementation.
- [PokerKit](https://github.com/uoftcprg/pokerkit) exposes a state-machine-oriented poker library. The inspected repository revision was `5841c0afe4d6eb71ae5db0f8a6a376ee3e329afb`; source inspection showed explicit operations for posting blinds, betting, showdown, and chip pushing.
- The [Poker Hand History specification](https://arxiv.org/abs/2312.11753) and [PokerKit paper](https://arxiv.org/abs/2308.07327) support machine-readable, replayable hand state as a useful interoperability and analysis boundary.

### Inferences adopted as research defaults

- Separate settlement proposal from balance mutation. The TDA dispute boundary and the product's existing explicit-authority model both favor a visible human confirmation gate.
- Keep exact betting legality in a deep accounting module and submit only typed player intents through the Trusted Host. This avoids duplicating raise, contribution, and pot policy in presentation clients.
- Use a named, pinned house-policy bundle rather than scattered switches. This makes future incompatible policies explicit and testable.
- Preserve Deal-Only mode as the default until Digital Chips passes the wider Phase 2 test matrix.

### Unknowns and revisit triggers

- Physical-device, Airplane-mode, long-session, browser-suspension, and mainland-China behavior have not been field-tested for Digital Chips.
- `p2-house-1` does not yet implement its top-up or re-entry behavior.
- Multiway short-all-in reopening rules and complex side-pot vectors need model/property testing and an independent differential oracle before release qualification.
- Any pivot to real money, tournaments, remote human play, accounts, or automated settlement requires new research and explicit owner approval.

## Applied decision

`PHASE2-HOUSE-POLICY-V1` adopts `p2-house-1` for the initial profile:

1. Integer play-chip units only.
2. Small blind and big blind only; no ante or straddle.
3. The Trusted Host proposes settlement; balances move only after explicit host confirmation.
4. Split-pot remainder chips are assigned clockwise from the first eligible winner left of the dealer button.
5. Top-ups occur only between hands.
6. A returning player waits for the big blind.

The first four rules are represented in the current accounting seam. Rules 5–6 remain required follow-up behavior, not completed functionality.


## Betting refinement — 2026-09-14

Fact: [Poker TDA Rule 47 and its addendum](https://www.pokertda.com/view-poker-tda-rules/)
describe reopening per player, using the cumulative increase faced since that
player last acted. A short all-in does not replace the last full raise
increment. [Robert's Rules, section 14](https://homepokertourney.org/docs/RobsPkrRules5.pdf)
also excludes a prior actor facing less than a full wager from raising again.
These are rule references, not a claim that tournament administration applies
to the home-session product.

Research default for `p2-house-1`: keep that player-specific reopening rule;
an unacted player raising over a short opening all-in must add the full minimum
increment (with big blind 2 and a short opening of 1, the minimum raise-to is 3).
The [TDA's short-opening discussion](https://www.pokertda.com/forum/index.php?topic=1456.0)
corroborates that interpretation, but is discussion rather than normative TDA
rule text. Tests cover a prior checker separately from an unacted player.

Implementation inference: retain the nominal big-blind bring-in while two or
more players still have chips to bet. When only one remains, require only an
outstanding actual contribution; a nominal payment cannot create a contested
side pot against an all-in opponent. With no pending response, emit the same
street-runout events used after a called all-in. These defaults remain subject
to independent differential qualification before release.

Known ledger limitation: unmatched excess is still represented as a
single-eligible-player settlement layer and returned through confirmation.
Final chip conservation is covered, but distinguishing returns from contested
pot awards remains required for the history/export slice.
