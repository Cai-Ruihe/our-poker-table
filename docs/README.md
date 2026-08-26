# Documentation map

The documentation is deliberately split by authority and reading purpose. Start with the smallest path that answers the task.

## Product requirements

- [Master PRD](prd/MASTER-PRD.md) — product direction and router, not the full specification.
- [PRD system guide](prd/README.md) — authority, context-loading, budgets, and change protocol.
- [Machine-readable manifest](prd/manifest.yaml) — phase/module graph and task context packs.
- [Decision register](prd/reference/DECISION-REGISTER.md) — settled, deferred, soft-set, and test-gated choices.
- [Evidence index](prd/reference/EVIDENCE-INDEX.md) — primary and inspected precedent sources.
- [Glossary](prd/reference/GLOSSARY.md) — canonical product language.
- [PRD system intent review](prd/reviews/PRD-SYSTEM-INTENT-REVIEW.md) — validation receipt, repaired findings, and remaining implementation/publication gates.

## Architecture and decisions

- [Phase 1 runtime architecture](architecture/PHASE-1-RUNTIME.md) — current mode composition, trust boundaries, recovery, and evidence limits.
- [Repository layout](architecture/REPOSITORY-LAYOUT.md) — source boundaries and dependency rules.
- [ADR index](adr/README.md) — accepted cross-cutting architecture and governance choices.
- [TypeScript browser monorepo ADR](adr/0007-typescript-browser-monorepo-toolchain.md) — current implementation and test toolchain.

## Design records

- [Our Poker Table brand guidelines](design/brand/README.md) — accepted product-facing name, mark geometry, lockups, colors, clearspace, accessibility, asset links, and evidence limits.
- [Shared visual system](design/SHARED-VISUAL-SYSTEM.md) — production-integrated Dark Green, Black Gold, and Deep Navy tokens; card, interaction, accessibility, and role-adaptation principles.
- [Tablet UI and shared-table visual feedback](design/TABLET-UI-FEEDBACK-2026-08-16.md) — accepted owner direction, rejected patterns, revision-v6 evidence, production-integration receipt, and remaining physical-device gates.

## Quality and release

- [Quality gates](quality/QUALITY-GATES.md) — checks required at contribution, phase, and release boundaries.
- [Phase 1 local release candidate](releases/PHASE-1-LOCAL-RC.md) — implemented scope, local evidence, and explicit external release blockers.
- [Release checklist](releasing/RELEASE-CHECKLIST.md) — evidence required before an official release.
- [Table-side Mode operations](operations/TABLE-SIDE-MODE.md), [Table-side Mode self-hosting](operations/TABLE-SIDE-MODE-SELF-HOSTING.md), and [Airplane Mode operations](operations/AIRPLANE-MODE.md) — operator-facing use, deployer-owned server, diagnostics, and recovery instructions.
- [Card Privacy automated red-team record](security/PHASE-1-CARD-PRIVACY-RED-TEAM.md) — regression evidence and what it does not prove.
- [Security policy](../SECURITY.md) — trust limits, invariants, and private reporting.
- [Roadmap](../ROADMAP.md) — phase outcomes and evidence gates.

## Document authority

Normative sources control implementation: explicit owner decisions, accepted ADRs, the decision register, PRDs, and then approved tickets/tests. Research reports, examples, prototypes, and discussion notes are informative unless promoted into a normative source.

If two normative documents conflict, stop and use the reconciliation order in the [PRD system guide](prd/README.md). Do not silently choose the newest file modification time.

## Status labels

- **Current:** controlling and reconciled for the date it names.
- **Accepted:** a decision that controls its scope.
- **Proposed:** reviewable but not controlling.
- **Reserved:** architecture space exists; implementation is deferred.
- **Unverified:** a design target without passing evidence.
- **Superseded:** retained for history but no longer controlling.

## Adding documentation

Place a requirement in its single owning PRD, a cross-cutting technical choice in an ADR, operational release evidence in the release record, and temporary exploration outside normative documents. Prefer links over duplicated prose. Every new document should name its audience, authority/status, owner, and update trigger where those are not obvious.
