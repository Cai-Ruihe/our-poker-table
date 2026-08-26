# ADR-0004: Context-efficient modular PRD system

- **Status:** Accepted
- **Date:** 2026-08-14
- **Decider:** Project Owner
- **Scope:** Product and implementation documentation
- **Decision IDs:** Documentation architecture decision

## Context

The product spans local networking, privacy, poker rules, multiple presentations, recovery, later accounting, skins, and AI. One comprehensive PRD would become long, contradictory, and expensive for an implementation agent to load. Many small uncontrolled documents would make authority and dependency discovery unreliable.

## Evidence

### Facts

- A task normally changes one phase outcome and one primary module boundary.
- Repeating cross-cutting requirements across documents creates multiple update points.
- Machine-readable metadata can select relevant documents without embedding their content.

### Inference

A short master router plus phase/module ownership gives agents enough context while preserving a coherent product view.

### Unknowns

Actual agent context usage and document drift rates must be measured during implementation.

## Decision

Use one Master PRD for product direction and routing, one PRD per delivery phase, one PRD per deep module, a decision register for settled choices, and a YAML manifest for dependencies and task context packs. Ordinary tasks load the Master, exactly one active phase, one primary module, at most two declared dependencies, and only cited decision rows. Document word budgets are enforced.

## Consequences

Agents read less irrelevant material and each requirement has a named owner. Maintainers must keep IDs, links, manifest entries, phase coverage, and authority reconciliation valid. Cross-module work may require an explicit context-pack exception rather than silently loading everything.

## Alternatives considered

- **Single master specification:** rejected due to context cost and repeated unrelated edits.
- **One document per feature:** rejected because features cross privacy, recovery, and presentation boundaries and obscure durable ownership.
- **Tickets as the only specification:** rejected because tickets are execution slices, not long-lived product authority.

## Security and privacy effect

Security invariants remain owned by M02 and M08 and are loaded by the security context pack. Smaller contexts must never omit an affected trust boundary; dependency declarations and review gates defend against that failure.

## Validation and revisit trigger

Repository validation must enforce unique IDs, valid links, declared files, required sections, and word budgets before merge. Revisit the partition if implementation tasks repeatedly need more than the allowed dependency set or decisions drift across modules.
