# ADR-0010: Localized table presentation

- **Status:** Accepted
- **Date:** 2026-08-27
- **Decider:** Project Owner
- **Scope:** Phase 1 presentation; M05 Airplane Mode and M06 Presentation and Interaction
- **Decision IDs:** `UI-LOCALIZATION`, `UI-MINIMAL-RUNNING`, `NET-AIRPLANE`

## Context

Our Poker Table needs a usable English/Simplified-Chinese interface without
turning an in-person table into a settings-heavy product. The Host should set
the natural starting language for newcomers, but a player, tablet, or TV owner
must retain local control. Airplane must remain a complete offline artifact.

## Evidence

### Facts

- The product uses one shared presentation layer for Player, Tablet, TV, and
  Public Table while its Table-side and Airplane builds share the same Phase 1
  core.
- The product owner requires modern, natural Chinese rather than literal
  translation, an obvious first-screen host control, and unobtrusive controls
  on quiet table surfaces.

### Inferences

- Locale is presentation configuration, not game authority or a poker event.
- A Host-provided default plus a device-local override serves a new invitee
  without central accounts or a per-player configuration flow.

### Unknowns

- Exact Chinese copy must be visually and linguistically reviewed in the
  complete interface, including long/error states and iPad controls.

## Decision

The interface provides English and Simplified Chinese. The Host selects a
prominent default before creating a table. The Host default travels only as
presentation metadata for newly opened invitation/pairing surfaces; it grants
no capability and contains no card/authority material. A device-local choice
overrides and persists locally. Other role surfaces expose language from
existing secondary/menu controls so quiet tabletop views stay uncluttered.
Airplane packages the same locale behavior entirely locally and does not create
an external request or change the pairing/transport contract.

## Consequences

### Benefits

- Newcomers begin in the Host's language without account setup.
- Each physical device can remain in its owner's preferred language.
- Chinese copy can be reviewed as product writing rather than a browser
  translation artifact.

### Costs and risks

- Every visible state and error requires bilingual coverage.
- Host default and local override need clear precedence tests.
- This decision does not translate repository documentation or alter game
  protocol semantics.

## Alternatives considered

- **Browser-language-only:** rejected because a physical table may use mixed
  devices while the Host needs a predictable starting language.
- **One immutable table language:** rejected because it removes a device
  owner's local accessibility/preference control.
- **Persistent in-table language chrome:** rejected because it disrupts quiet
  Player, Tablet, and TV surfaces.

## Security and privacy effect

Locale contains no card, credential, or authority material. A language choice
must not change role filtering, diagnostics redaction, pairing capability, or
Airplane's zero-external-request property.

## Validation and revisit trigger

Automate the Host default, invited-device default, local override, reload
persistence, and quiet-surface menu paths. Run English and Chinese visual QA at
phone, iPad fullscreen/browser-chrome, tablet, and TV sizes; run Airplane from
the downloaded artifact with WAN removed. Revisit if physical review finds
unnatural copy, truncation, or a locale setting leaks into authority/transport.
