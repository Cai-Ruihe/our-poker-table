# Phase 1 corrective release specification

**Status:** Implementation authorized on 2026-08-17. Publication is authorized only after every automated release blocker passes.

## Outcome

Publish a Phase 1 field build that conforms to the approved Tablet v6 interaction system, fixes the reported player lifecycle and card-display defects, and is governed by a repository-owned QA system rather than conversation memory.

## Required slices

1. **QA authority:** import every PRD User Story and Testing Decision, every product decision, TUI-001–031, and every field-feedback ID; fail closed on missing coverage.
2. **Tablet conformance:** quiet card-first surface; equal four-corner triggers; upper-seat orientation; exact compact quick-panel geometry; custom short physical slider; centered complete secondary controls; three synchronized themes; full-screen action; auto-dismiss after successful actions.
3. **Player lifecycle:** automatic visible-state catch-up; disabled-until-needed Reconnect; immediate next-hand updates; a compact named seat/status row; a top-right step-away pop-out with Sit out switch and deliberate permanent-leave slider; and permanent credential-revoking leave.
4. **Entry:** default Normal screen accepts a pasted invitation URL or an in-page QR scan.
5. **Cards and showdown:** compact one-sided mini cards never overlap; shown hands remain visible; the winning best five are emphasized and unused cards recede.
6. **Release evidence:** contract, privacy, accessibility, geometry, visual, responsive, cross-engine, build, audit, manifest, CI, Pages, and deployed read-back evidence.

## Acceptance boundary

- A screenshot-visible mismatch is a release failure even if the control works.
- A click/drag test is not visual evidence.
- A Chromium snapshot is not WebKit behavior evidence.
- A simulated mobile browser is not physical iOS suspension/camera/network evidence.
- Physical evidence adds to, and never replaces, automated evidence.
- Phase 2/3 requirements remain traceable but deferred unless explicitly included in this corrective release.

## Test seam

- Pure authority and projection behavior: Vitest contract tests through package exports.
- Browser roles and recovery: Playwright journeys through the built application.
- Visual design: deterministic Chromium screenshots plus computed geometry and rejected-design assertions in Chromium and WebKit.
- Physical-only behavior: dated field protocols with device, OS, browser, network, candidate commit, outcome, and minimized evidence.

## Stop conditions

Do not publish when a release-blocking gate fails, a visual baseline is generated without human-readable inspection, hidden data appears in evidence, the worktree contains unrelated changes, or the deployed artifact cannot be matched to the pushed commit.
