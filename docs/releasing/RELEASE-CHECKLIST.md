# Official release checklist

Use this checklist for a release candidate; do not mark an item complete without an inspectable receipt. Additional phase gates remain controlling.

## Authority and scope

- [ ] Release owner and approvers are named.
- [ ] Target commit is reviewed, protected, and corresponds to the intended phase/scope.
- [ ] Public pointers use `Cai-Ruihe/our-poker-table` and the `https://ourpokertable.com/` production root; former `html-poker-app` and GitHub Pages paths are not emitted as fallbacks.
- [ ] PRD decision register, ADR index, roadmap, changelog, and user documentation are reconciled.
- [ ] `pnpm qa:registry` imports every PRD story/testing decision and every stable product, Tablet, and field-feedback ID without an untracked requirement.
- [ ] No unapproved feature, experiment, telemetry, provider, or third-party runtime appears in the artifact.

## Build and supply chain

- [ ] Build starts from a clean checkout and locked dependencies/toolchain.
- [ ] Table-side and Airplane artifacts are immutable and self-contained for their declared mode.
- [ ] `pnpm release:reproducibility` passes and a `pnpm release:manifest` / `pnpm release:verify` receipt records every artifact digest from the tagged commit.
- [ ] Artifact digests and provenance/signature receipts are recorded.
- [ ] The deployed manifest's build version and source revision match the intended candidate; a repository or Pages-route rename is not accepted as release evidence.
- [ ] Dependency vulnerability, licence, and NOTICE inventory is reviewed.
- [ ] Artifact substitution, downgrade, mixed-version, and offline update behavior passes.

## Correctness and compatibility

- [ ] Contract, journey, fault, accessibility, performance, and compatibility suites pass.
- [ ] Every available secondary/menu action is present in the stable action inventory, invoked through the built app, and verified by resulting state—not label presence alone.
- [ ] Deterministic visual baselines for every affected role/state/theme were inspected at full resolution; exact geometry, orientation, touch targets, rejected symbols, clipping, and overflow assertions pass in Chromium and Mobile WebKit.
- [ ] Bundle budgets pass, and unmeasured initial-load, battery, memory, camera, and network performance remains explicitly Unknown.
- [ ] Real supported devices cover Player, Tablet, TV, and host journeys as applicable.
- [ ] Refresh, reconnect, network change, player power loss, storage pressure, and host recovery outcomes match the PRD.
- [ ] Airplane Mode runs with internet unavailable on every claimed supported platform.
- [ ] China readiness is claimed only with dated representative network evidence.

## Privacy and security

- [ ] Card Privacy Red Team gate is complete and release-blocking findings are closed.
- [ ] Public/control/seat projections and histories contain only authorized information.
- [ ] Logs, diagnostics, checkpoints, support bundles, URLs, and errors pass secret-canary tests.
- [ ] Signaling/relay services remain card-blind; AI services are absent unless explicitly in the release scope.
- [ ] Private vulnerability and conduct-reporting channels work and are monitored.
- [ ] Trust limitations and known accepted risks are visible in release notes and product surfaces.

## Operations and handoff

- [ ] Deployment configuration never defaults to Ruihe's private endpoints or credentials.
- [ ] The unconfigured-fork contract, deployer-owned Compose recipe, token-file handling, and self-hosting documentation pass `tests/contract/table-side-self-hosting.test.ts` and `tests/contract/table-side-release-config.test.ts`.
- [ ] For configured Table-side Mode, `pnpm qa:live-relay` proves public DNS, `/health`, exact-origin CORS preflight, and invalid-token rejection before manifest creation or Pages deployment; the owner-only token acceptance check passes without logging credentials.
- [ ] The deployed `table-side/poker-config.js` is read back and contains the same verified WSS URL; a dead or different URL is a rollback/block condition.
- [ ] Rollback and last-known-good artifacts are available without changing a live table mid-game.
- [ ] Retention/deletion behavior is verified, including the 30-day diagnostic maximum.
- [ ] Release notes name breaking changes, migration, supported matrix, known limitations, and evidence summary.
- [ ] Post-release monitoring is privacy-preserving and has an owner and stop condition.

## Release receipt

Record version, date, commit, artifact digests, evidence links, approvers, known risks, rollback artifact, and final go/no-go decision in the future release-record directory. The receipt must not contain unrevealed cards, session credentials, or raw private diagnostics.

The repository's generated local manifest is only a provenance input. It becomes an official release receipt only after the owner records the matching tag, signature policy, approvers, external test evidence, and go/no-go decision.
