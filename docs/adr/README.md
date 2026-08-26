# Architecture Decision Records

ADRs record decisions that are cross-cutting, difficult to reverse, security-relevant, or necessary to understand the repository's shape. Product behavior remains in the PRDs; an ADR explains why a technical/governance direction was chosen and what it costs.

## Status meanings

- **Proposed:** open for review and not controlling.
- **Accepted:** controlling within its stated scope.
- **Rejected:** considered and not selected.
- **Superseded:** replaced by a named later ADR but retained for history.
- **Accepted for roadmap:** controls reserved interfaces but does not authorize implementation in the current phase.

## Index

| ADR | Status | Decision |
|---|---|---|
| [0001](0001-trusted-host-now-mental-poker-seam.md) | Accepted | Trusted Host now; replaceable Card Custody seam for future Mental Poker |
| [0002](0002-apache-2-and-official-core-governance.md) | Accepted | Apache-2.0 rights plus owner-approved Official Core changes and releases |
| [0003](0003-provider-neutral-ai-seat-boundary.md) | Accepted for roadmap | Provider-neutral AI SeatController and isolated AI Gateway |
| [0004](0004-context-efficient-modular-prds.md) | Accepted | Master router, phase PRDs, module PRDs, and manifest context packs |
| [0005](0005-deployer-owned-connectivity-ladder.md) | Accepted | Direct P2P, private relay, optional cloud relay; deployer-owned |
| [0006](0006-standalone-airplane-mode.md) | Accepted | Preloaded standalone Airplane artifact over private local Wi-Fi |
| [0007](0007-typescript-browser-monorepo-toolchain.md) | Accepted | Strict TypeScript, pnpm workspaces, React/Vite, Vitest, and Playwright |
| [0008](0008-traceable-release-blocking-qa.md) | Accepted | Machine-readable requirement traceability plus release-blocking functional and visual QA |
| [0009](0009-host-liveness-without-single-timeout-alerts.md) | Accepted | Lightweight Host liveness with a three-miss threshold and no custom polling coordinator |
| [0010](0010-localized-table-presentation.md) | Accepted | Host-default, device-overridable bilingual presentation without changing Airplane transport |

## Creating or changing an ADR

1. Copy [ADR-TEMPLATE.md](ADR-TEMPLATE.md) to the next four-digit number and a short kebab-case name.
2. Link the affected decision IDs and PRDs; do not duplicate their detailed requirements.
3. Separate evidence-backed facts, design inferences, and unresolved unknowns.
4. Name consequences, rejected alternatives, security/privacy effect, and a measurable revisit trigger.
5. Update this index. If superseding, update both records and the decision register without deleting history.

An accepted ADR requires the Project Owner for product/security direction, or the delegated maintainer for an ordinary technical choice within already accepted boundaries.
