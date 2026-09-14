# ADR-0012: Independent phase release paths

- **Status:** Accepted direction; implementation pending
- **Date:** 2026-09-14
- **Deciders:** Project Owner (separate phase URLs and preserve Phase 1); implementation defaults recorded by the maintainer
- **Scope:** M09 release packaging; P2 delivery; future P3 entrypoint
- **Decision IDs:** `DIST-PHASE-CHANNELS`, `SUPPLYCHAIN-IMMUTABLE-RELEASE`, `NET-VERSION`

## Context and evidence

The owner wants Phase 2 at a separate URL, for example
`ourpokertable.com/multiplayer`, with Phase 1 continuing normally and Phase 3
later using another URL. M09 retains `/table-side/` as the Phase 1 path.

**Fact:** `.github/workflows/ci.yml` currently builds and packages the whole
party site from one checkout. `apps/web/vite.config.ts` emits one Table-side
bundle. `apps/web/src/runtime.ts` names recovery databases and host/client
locks by table/role rather than phase. Separate URL folders alone therefore
do not implement the requested independent release lifecycle.

The release-manifest and relay-configuration tools also currently target
Phase 1/Table-side output. The invitation builder preserves the path, but
the pasted-invitation handler copies a fragment onto the current path.
Publication work must therefore cover per-phase manifests/configuration and
paste handling as well as folders and generated links.

**Fact:** Different paths on one origin share browser authority, including
origin-scoped storage. See the [MDN same-origin definition and storage
rules](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy).

**Inference / implementation default:** keep one source repository but select
independently versioned, immutable artifacts per phase when assembling the
static site. Source reuse need not force release coupling.

## Decision

M09 owns the route contract: Phase 1 `/table-side/`; Phase 2 working path
`/multiplayer/`; Phase 3 slug deferred. Do not replace the current default
entry or redirect Phase 1 users into a later phase as part of a Phase 2 release.

The release assembler must take an explicit artifact version/digest for each
phase. A Phase 2-only publication retains the selected Phase 1 files and
manifest byte-for-byte, rather than rebuilding Phase 1 from the current branch.
Keep root, introduction, and standalone Airplane artifacts separately selected
too. Missing retained artifacts or digest mismatches must fail packaging.
On the current single-site host, one assembled site may still be deployed;
independence means selecting unchanged artifacts for phases not being updated.

New-phase runtime work must scope recovery data, leases/locks, local messaging,
and any cache/service-worker names to that phase, preserve invitation paths,
and reject incompatible phase/build joins. Do not rename or clear existing
Phase 1 storage. Shared harmless preferences may remain explicitly shared.
Relay reuse requires backward-compatible client behavior and separate room
bindings; it does not authorize changing the running Phase 1 relay contract.

## Consequences and alternatives

This provides independent promotion/rollback and familiar URLs, at the cost of
retaining artifacts and testing phase coexistence. A query flag in a single
rebuilt bundle was rejected because it couples releases. Separate repositories
are unnecessary for this requirement. Subdomains would provide stronger
browser-origin isolation; reconsider them if future untrusted code or providers
require that boundary. Namespacing prevents accidental interference, not a
compromised same-origin script from accessing other phase data.

## Validation and unknowns

Before publication, record the actual approved Phase 1 artifact and revision;
that exact pin has not been selected in this design task. Implement and test:

1. Phase 2 promotion and rollback leave Phase 1 artifacts/manifests unchanged.
2. Both paths cold-load all assets and preserve the path in invitations/QRs.
3. A Phase 1 host and private seat survive refresh while Phase 2 is used in the
   same browser; neither phase migrates/deletes the other's recovery state.
4. Direct and pasted wrong-phase/build invitations fail clearly without
   loading private state. Phase-specific build identities remain incompatible
   with frozen Phase 1 clients; a pasted fragment must not bypass that check.
5. Any shared relay update retains Phase 1 interoperability; any service worker
   respects path scope and never activates during an active table.
6. Each selected artifact has its own verified relay configuration/CSP and
   manifest; hosted read-back matches every selected revision and digest.

This ADR records the release direction. It does not publish `/multiplayer/`,
claim current production isolation, enable full remote human play, or select a
Phase 3 product name. Revisit if the host changes, trusted-code assumptions
change, or phase coexistence cannot meet the preservation checks.
