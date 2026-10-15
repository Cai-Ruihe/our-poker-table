# Digital Participation Authority Implementation Plan

> **For agentic workers:** Use subagent-driven-development for this bounded task; the parent retains integration and acceptance.

**Goal:** Prevent unsupported digital participation commands from clearing a missed-hand seat restriction.

**Architecture:** Game Core owns command legality. The digital fixed-roster profile rejects participation changes before changing authoritative state; the runtime's existing outer rejection remains. Accounting and Phase 1 semantics stay intact.

**Tech Stack:** TypeScript, pnpm 11.19.0, Node 24, Vitest, existing Trusted Host contracts.

## Global Constraints

- BASE: `091ed94938e85fce1603e47cfc8cbca0b8f59c43`.
- Work only in `worktrees/phase2-round-20261015`, branch `fix/phase2-participation-20261015`.
- Authorized window: 2026-10-15 03:07–09:07 UTC; no automatic extension.
- Play chips only; persist before acknowledgement; hidden cards remain seat/host scoped.
- No late joins, re-entry feature, corrections, UI changes, dependency changes, merge or deployment.
- Preserve the dirty original checkouts. One active implementation writer, model `gpt-6.1-sol`.

## Task 1: Close the digital participation contract

**Files:**
- Modify: `packages/game-core/src/index.ts`, owning `SetSeatParticipation` branch.
- Test: `tests/contract/digital-accounting-top-up.test.ts` and a focused participation contract file if separation improves readability.
- Document: `docs/architecture/PHASE-2-ACCOUNTING.md`, one concise dated verification note.

**Interfaces:** Consume `authority.submit(CommandEnvelope)` and the existing persisted-store/project/history interfaces. Produce rejected `command-not-allowed` receipts without revision or state mutation for unsupported digital participation.

- [ ] Re-run the existing test baseline before editing production code.
- [ ] Add a failing regression using the existing busted-three-seat fixture. Alice busts; hand 2 excludes Alice; hand 2 settles; direct top-up is rejected. Submit Alice's `SetSeatParticipation` with `sittingOut:false`, then try host top-up. Assert participation rejection and unchanged revision, history, public/private projections and persisted store. Repeat after authority recovery.
- [ ] Add a bounded actor/lifecycle matrix: host, own seat, other seat; true/false; lobby, betting, settlement and complete. Digital unsupported participation must fail closed. Keep existing Phase 1 sit-out/return as a positive contrasting case.
- [ ] Observe the new test fail because the current digital command is accepted, saving the exact command/output before changing production code.

The intended boundary condition is the existing profile predicate at the command owner, for example:

```ts
if (!current || accountingFor(rulesProfileOf(current))) {
  return rejected("command-not-allowed", revision);
}
```

- [ ] Apply the smallest justified guard after confirming the existing predicate's semantics; do not weaken top-up restrictions or add a second eligibility mechanism.
- [ ] Run the new regression, existing digital top-up/recovery/betting suites, authority/persistence/privacy and Phase 1 participation contracts. Check rejected commands leave durable state unchanged, and immediate pre-missed-deal top-up still succeeds.
- [ ] Format/typecheck/lint changed files and add the concise architecture evidence note with actual results and remaining limits.
- [ ] Return a fixed diff and report including RED/GREEN commands/results, source hashes and remaining gaps. Do not merge, push, deploy or change the original thread.

## Acceptance and review

The observed bypass must become an explicit rejected command, including after recovery. Existing supported digital top-up and Phase 1 participation behavior must remain valid. A non-author reviewer checks spec compliance and quality against this plan and the fixed diff. The independent Architect checks invariant ownership. Missing real-device/production evidence stays unknown; this task is a local candidate.
