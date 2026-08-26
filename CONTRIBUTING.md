# Contributing

Thank you for helping build a trustworthy, quiet, browser-based poker table. Contributions may include research, issue reproduction, documentation, tests, accessibility work, code, security analysis, and—once the format exists—data-only skins.

## Before starting

1. Read the [project status and trust model](README.md).
2. Use the [PRD manifest](docs/prd/manifest.yaml) to load the smallest relevant context pack.
3. Search existing issues, decisions, and pull requests before proposing a duplicate.
4. For a material architecture or product change, open a proposal before implementation. Explain the user problem, evidence, security effect, alternatives, and which PRD or ADR would change.

The implementation stack is controlled by [ADR-0007](docs/adr/0007-typescript-browser-monorepo-toolchain.md). Do not change its framework, build system, package model, hosted dependencies, analytics boundary, or runtime third-party-code rule without a superseding accepted architecture decision.

## Contribution boundaries

- This is play-chip-only software. Real-money, payment, rake, cash-out, and gambling-account features are out of scope.
- Hidden-card privacy is the highest security property. Never place unrevealed cards, deck order, credentials, or session keys in public projections, URLs, analytics, logs, crash reports, screenshots, or cloud backups.
- The active host is trusted in Phase 1. Do not make a stronger claim in code or documentation.
- Table-side play must not depend on the project owner's computer, cloud account, analytics, AI provider, or other central poker engine.
- Airplane Mode and the base human game must not depend on AI or internet services.
- Community skins must be data-only. Executable community code requires a separate, explicitly accepted security design.
- Bold Poker may inspire interaction behavior; do not copy its code, artwork, branding, text, sounds, or exact interface expression.

## Pull-request standard

Keep each pull request small enough to review as one coherent change. A good pull request includes:

- a concise problem and solution;
- the linked issue, PRD section, decision ID, or ADR;
- tests at the affected module boundary and, where relevant, a user-journey test;
- security and privacy impact, including “none” with a reason;
- compatibility or migration impact;
- screenshots or recordings for visible behavior;
- documentation changes when behavior or an interface changes; and
- a note describing any AI-assisted work and how a human verified it.

Do not combine unrelated formatting, refactoring, dependency, and feature changes. Generated files and dependency lockfiles must be explained and reproducible.

## Verification expectations

Install the locked dependency graph with Node.js 24 and pnpm 11, then run the complete local gate:

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` verifies formatting, lint rules, strict types, documentation contracts, the product QA registry, module/contract tests, production builds, and artifact performance budgets. Changes to visible behavior or browser trust boundaries must also run the complete release-blocking browser suite:

```sh
pnpm exec playwright install chromium webkit
pnpm qa:browser
```

Use `pnpm test:coverage` when changing authority, custody, persistence, or projection policy. A passing emulated-browser journey is development evidence, not a substitute for the physical-device and network matrix required for release.

Before a dependency or release change, also run `pnpm audit:prod` and inspect `pnpm licenses:prod`; vulnerability output and licence obligations are review inputs, not auto-approval.

Card custody, projections, authentication, recovery, relay behavior, diagnostics, release integrity, or AI-provider changes require the phase Card Privacy Red Team gate described in [M08](docs/prd/modules/M08-DIAGNOSTICS-RED-TEAM.md).

## Decisions and documentation

- Product requirements belong in the one PRD that owns them.
- Cross-cutting technical decisions belong in an [ADR](docs/adr/README.md).
- Owner decisions must receive or update an entry in the [decision register](docs/prd/reference/DECISION-REGISTER.md).
- Preserve superseded decisions rather than rewriting history.
- Facts, inferences, and unknowns should be distinguishable wherever uncertainty affects a decision.

## Review and merge

All pull requests require maintainer review. Every Official Core change and Official Release requires Project Owner approval; security-sensitive core changes also require an explicit privacy/security review. Passing tests does not guarantee merge: coherence with product direction, maintainability, accessibility, and risk also matter.

Apache-2.0 permits contributors to modify and distribute forks. Maintainer approval controls only the official repository and official releases. See [GOVERNANCE.md](GOVERNANCE.md).

## Licence of contributions

Unless you explicitly state otherwise, contributions intentionally submitted for inclusion are provided under the [Apache License 2.0](LICENSE), consistent with section 5 of that licence. Changes derived from [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) remain under its stated CC BY-SA 4.0 terms. Do not submit material you do not have the right to contribute.

## Conduct and security

Participating in this project means following the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately according to [SECURITY.md](SECURITY.md), never through a public issue containing exploit details or private-card data.
