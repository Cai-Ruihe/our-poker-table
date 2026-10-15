# Frozen Settlement Qualification Implementation Plan

> **For agentic workers:** Use subagent-driven-development for this bounded task; the parent retains integration and acceptance.

**Goal:** Execute six independently calculated, frozen accounting vectors through the production accounting interface.

**Architecture:** Keep the oracle as literal reviewed test data with provenance and hand derivations. The adapter submits fixed actions and compares actual contributions, eligibility, awards and final stacks against those literals. No production reducer or runtime dependency is added.

**Tech Stack:** TypeScript, Vitest and checked-in JSON fixtures.

## Global Constraints

- Same isolated worktree and branch as the P0 task; only start after P0 implementation is frozen and its review has no open important findings.
- Authorized window ends 2026-10-15 09:07 UTC without automatic extension.
- No new wish list, card-evaluator qualification, external oracle package, new refund event, credentials, merge, push or deployment.
- Play chips only. Proposal must not move balances; confirmation alone applies awards.
- Use independently prepared literals at `/Users/ruihecai/Documents/Codex/2026-10-15/task/evidence/settlement-vectors-architect.json`. Preserve the six IDs, values, mathematical derivations and independence limits. Do not regenerate expected values from the production engine.

## Task 1: Add the bounded independent settlement test surface

**Files:**
- Create `tests/fixtures/accounting/independent-settlement-vectors.json` from the frozen Architect input.
- Create `tests/contract/digital-accounting-frozen-settlement.test.ts`.
- Update the existing `docs/architecture/PHASE-2-ACCOUNTING.md` evidence note with the exact bounded qualification scope.

**Interfaces:** `createDigitalAccounting`, `submit`, `project` and `legalActions` are test subjects, never the expected-value generator. Each fixture specifies `CreateSession`, `StartHand`, literal action commands and a stipulated per-pot winner list.

- [ ] Preserve all six frozen vectors and their provenance in the fixture. Check each expected total by independent arithmetic; report a disagreement to PM/Architect rather than changing a literal to fit production.
- [ ] Write a data-driven adapter that executes each fixed command and records conservation at every accepted transition. Do not select actions or winners from actual engine output.

The adapter's expected-value boundary is literal data:

```ts
expect(Object.fromEntries(state.seats.map(s => [s.seatId, s.totalContribution])))
  .toEqual(vector.expected.contributions);
expect(accounting.project(state).pots).toEqual(vector.expected.pots);
```

- [ ] At the fixed short-all-in checkpoints, compare the call amount and presence/absence/minimum of a raise against the literal checkpoint. Check the no-reopen aggressive-all-in restriction.
- [ ] Check folded eligibility, per-pot proposed awards and ordered tied winners. A rejected ineligible winner proposal must leave the state unchanged. Proposal must preserve stacks; confirm must produce the exact final stacks and clear contributions. A second confirmation rejects.
- [ ] For uncalled excess, assert economic result and documented single-eligible-layer representation; do not introduce a production refund mechanism.
- [ ] Run the six vectors and existing accounting contracts. New tests may pass the current correct behavior; no production feature is being added. Demonstrate fault sensitivity by running the same frozen test against temporary isolated accounting mutations (pot amount, folded eligibility, odd-chip order) outside the checked-out production source. Record the specific failing vector IDs. Non-author QA may own this experiment.
- [ ] Run formatting, typecheck and focused lint. Return source hashes, commands/results, exact vector IDs covered and limitations in the report.
- [ ] Keep this a local candidate. A non-author checks the fixture math, adapter assertions and fault-sensitivity evidence; the Architect checks that the independent boundary has not collapsed into self-comparison.

## Acceptance and limits

All six frozen vectors pass on the candidate; deliberate isolated faults are caught. No expected values come from the engine under test. This is an accounting qualification slice with stipulated rankings, not complete differential verification or independent card evaluation. Existing monetary, privacy and confirmation boundaries remain unchanged.
