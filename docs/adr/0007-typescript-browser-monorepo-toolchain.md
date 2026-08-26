# ADR-0007: Strict TypeScript browser monorepo toolchain

- **Status:** Accepted
- **Date:** 2026-08-14
- **Deciders:** Project Owner authorization to implement Phase 1; implementation maintainer
- **Scope:** Repository shape and Phase 1 implementation; M01–M09
- **Decision IDs:** `ARCH-TOOLCHAIN`

## Context

Phase 1 now has an approved product contract and module layout, but implementation directories were intentionally blocked until a language, package model, browser floor, test runner, and release build were selected. The stack must support a static Table-side Mode application, a later self-contained Airplane artifact, strict module seams, browser cryptography and storage, real-browser tests, and approachable open-source contribution.

## Evidence

### Facts

- [Node.js 24 is an active LTS line](https://nodejs.org/en/about/previous-releases); the local build runtime is Node.js 24.
- [Vite produces static-hostable production bundles](https://vite.dev/guide/build) and its current default production target is Baseline Widely Available, including Safari/iOS 16.4 and later. Lower targets remain configurable.
- [Vite maintains an official React integration](https://vite.dev/guide/features.html), and React renders client applications using browser DOM primitives.
- [TypeScript strict mode](https://www.typescriptlang.org/tsconfig/strict) enables a family of checks intended to provide stronger correctness guarantees.
- [Vitest Browser Mode](https://vitest.dev/guide/browser/) runs tests in real browsers and recommends Playwright for CI; [Playwright](https://playwright.dev/docs/browsers) covers Chromium, Firefox, WebKit, branded browsers, and emulated mobile devices.
- pnpm workspaces and a committed lockfile provide one install graph for the planned applications and packages. The build environment currently provides pnpm 11.
- ESLint flat configuration is the [current ESLint configuration model](https://eslint.org/docs/latest/use/configure/configuration-files).

### Inferences

- Strict TypeScript plus narrow package exports makes command, event, projection, and persistence contracts easier to review and evolve than untyped browser JavaScript.
- React is a conservative contributor-facing choice for the several role-specific presentations; poker authority remains framework-free in independent packages, so this choice does not leak into Game Core or Card Custody.
- Vite, Vitest, and Playwright minimize duplicated build/test configuration while still leaving release artifacts provider-neutral.
- pnpm is preferable to an additional monorepo orchestrator at this scale; task caching can be added only after measured build pressure.

### Unknowns

- Actual iOS, Android, TV-browser, China-network, and standalone-file compatibility remains unverified.
- Whether the Airplane artifact can be one HTML file without a small reviewed packaging adapter remains an implementation test.
- Performance, backgrounding, storage durability, camera QR behavior, and local multi-peer limits require physical-device evidence.

## Decision

1. Use ESM-only strict TypeScript for application and package code.
2. Pin Node.js 24 LTS and pnpm 11 through repository metadata and commit the lockfile.
3. Use pnpm workspaces without a monorepo orchestration framework. Package exports are the module interfaces; undeclared cross-package imports are forbidden.
4. Use React for role-specific browser presentation and Vite for development and static production builds. Game Core, Card Custody, identity, persistence, transport, and diagnostics remain DOM- and React-free.
5. Use Vitest for module/contract tests and Playwright for journey, browser, accessibility, and privacy-screenshot tests. Tests exercise public module interfaces.
6. Use strict TypeScript checks, ESLint flat configuration, Prettier, documentation validation, dependency auditing, and a clean-build CI gate.
7. Start with Vite's current Baseline Widely Available production target. Supported-device claims require the PRD's physical test matrix; a failing target triggers an evidence-based compatibility change rather than a silent claim.
8. Bundle all runtime code, fonts, and assets. No third-party runtime CDN, analytics, or remote font request is permitted.
9. Produce a static HTTPS Table-side build first. The Airplane single-file target must reuse the same source and is added only with an offline external-request test and artifact inspection.

## Consequences

### Benefits

- Domain authority stays portable, deterministic, and testable outside the UI.
- Contributors get one locked install, one language, and familiar browser tooling.
- Module and browser tests share the same transform pipeline while retaining different test seams.
- Static hosting and later offline packaging remain deployer-neutral.

### Costs and risks

- React and its build tooling increase the dependency and audit surface relative to vanilla TypeScript.
- Baseline browser output may exclude older embedded TV browsers until measured testing justifies a legacy bundle.
- A workspace requires disciplined public exports and dependency checks to prevent accidental coupling.
- Toolchain currency requires deliberate lockfile updates and CI review.

## Alternatives considered

- **Vanilla TypeScript:** smaller runtime, but role-specific presentation and accessible interaction state would require more bespoke UI infrastructure. Revisit if React becomes a measured size or compatibility blocker.
- **Svelte, Solid, or Preact:** credible browser choices, but they do not materially improve the authority modules and would reduce the likely contributor familiarity assumed for the first implementation.
- **Full-stack framework:** rejected because Phase 1's base product must remain a provider-neutral static application; the card-blind Connection Service is a separate trust domain.
- **Turborepo/Nx:** deferred until build measurements show that native workspace scripts are insufficient.
- **Legacy browser bundle immediately:** rejected as an unmeasured cost; physical TV/browser tests are the trigger.

## Security and privacy effect

The stack does not change the Trusted Host model. Poker authority and Hidden Card State stay outside generic React state and are exposed only through role projections. Dependencies are build-time locked and bundled; no runtime third party receives code paths, table metadata, or cards. CI and browser tests improve evidence but do not prove the host is honest or the product is secure.

## Validation and revisit trigger

The ADR is validated when a clean clone can install from the lockfile, type-check, lint, validate documentation, run module tests, run the supported Playwright smoke matrix, build the static Table-side artifact, and show zero runtime external requests in the local journey. Revisit on a supported-device failure, an Airplane packaging failure, an unacceptable dependency/security finding, or sustained build/test friction that a different tool demonstrably resolves.
