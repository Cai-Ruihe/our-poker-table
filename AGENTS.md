# Agent working agreement

This repository is designed for context-efficient human and AI collaboration. Do not load the entire product specification by default.

## Required context route

1. Read [README.md](README.md) and [docs/prd/MASTER-PRD.md](docs/prd/MASTER-PRD.md).
2. Use [docs/prd/manifest.yaml](docs/prd/manifest.yaml) to select exactly one active Phase PRD and one primary Module PRD.
3. Load at most two declared module dependencies unless the task explicitly crosses more boundaries.
4. Load only the rows named by `decision_ids` in the selected PRDs from [the decision register](docs/prd/reference/DECISION-REGISTER.md); do not preload it for ordinary tasks.
5. Load [the ADR index](docs/adr/README.md) only for cross-cutting, difficult-to-reverse, security, governance, or repository-shape work.

If the task does not fit a context pack, state the smallest custom pack and why before implementation.

## Non-negotiable boundaries

- Play chips have no monetary value. Do not add payment, cash-out, rake, gambling accounts, or real-money claims.
- Card privacy is the security floor. Never send or record hidden cards outside the authorized seat and Trusted Host custody boundary.
- Phase 1 trusts the host. Do not claim protection from a malicious or compromised host.
- The base human game and Airplane Mode must not require accounts, AI, analytics, or Ruihe's private infrastructure.
- Table-side connectivity is direct P2P → deployer private relay → optional deployer cloud relay.
- Community skins are data-only; no executable skin packages.
- Bold Poker is behavioral inspiration only. Do not copy protected code, artwork, branding, sounds, text, or exact interface expression.
- Do not create implementation scaffolding or select a stack before an accepted toolchain ADR.

## Decision discipline

Use the authority order in [docs/prd/README.md](docs/prd/README.md). A new owner decision updates the decision register first. Cross-cutting technical choices require an ADR. Preserve superseded history.

Distinguish:

- **Fact:** directly supported by current code, test output, primary evidence, or an explicit owner decision.
- **Inference:** a reasoned design conclusion with its assumptions.
- **Unknown:** untested, time-sensitive, or unavailable evidence.

Do not ask the owner to choose an ordinary established practice when the existing research, a safe default, or a named empirical test settles it. Ask only for consequential conflicts, irreversible trade-offs, authority expansion, or true open-major gaps.

## Change standard

- Keep changes small and owned by one module where possible.
- Update the single owning PRD rather than duplicating requirements.
- Treat commands/events/schemas as versioned public contracts.
- Persist before acknowledgement or irreversible projection.
- Add module-contract and failure-path tests for behavior changes.
- Run an adversarial Card Privacy Red Team check for every phase and every affected privacy boundary.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [quality gates](docs/quality/QUALITY-GATES.md).

## External effects

Local planning or implementation does not authorize creating a GitHub repository, pushing, publishing, deploying, registering a domain, enabling paid infrastructure, or contacting third parties. State the exact effect and obtain the owner's authorization at the relevant gate.
