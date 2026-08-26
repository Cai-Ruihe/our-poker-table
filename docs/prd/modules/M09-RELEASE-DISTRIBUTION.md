---
id: PRD-M09
kind: module
status: current
last_reconciled: 2026-08-17
decision_ids:
  - GOV-LICENCE
  - GOV-OFFICIAL-CORE
  - GOV-CUSTOM-HOST
  - NET-OWNER-ISOLATION
  - NET-VERSION
  - DIST-STATIC-HTTPS
  - SUPPLYCHAIN-IMMUTABLE-RELEASE
  - HOST-CAPABILITY-PREFLIGHT
  - PRIVACY-ZERO-TELEMETRY
  - TEST-IOS-STANDALONE
  - TEST-UPDATE-SUPPLY-CHAIN
router: ../manifest.yaml
---

# M09 — Release and Distribution

## Context capsule

This module owns the canonical public identity and turns reviewed source into immutable Official Table-side and Airplane artifacts. It documents how deployers host/configure them without using Ruihe's infrastructure. Its interface is a release manifest: version, source revision, artifact digests, protocol/rules/schema ranges, provenance, dependency inventory, signatures, migrations, and compatibility. It proves provenance—not that a running host is honest.

## Problem Statement

A static web app is inexpensive to publish, but silent top-level replacement, CDN dependencies, service-worker updates, mixed offline files, leaked relay credentials, and community forks can change card-sensitive code during play or confuse users about trust.

## Solution and Interface

Produce two self-contained release targets from one source revision: an HTTPS Table-side build and one standalone Airplane HTML file. Publish immutable artifacts plus verifiable metadata. Hosting and service configuration are injected per deployer. A live table pins its build and activates updates/migrations only when no table is active.

### Owns

- Deterministic build/release contract, artifact naming, versioning, hashes/signatures, SBOM, provenance, and changelog.
- Table-side static-hosting package and Airplane single-file package.
- Service-worker staging, migration compatibility, rollback/downgrade defenses, and visible build ID.
- Official Release versus Custom Host labeling and distribution documentation.
- Open-source licence/notices and deployer-owned configuration boundary.
- Canonical public repository and Pages routes, their migration behavior, and the boundary between public names and retained technical identifiers.

### Does not own

- Application behavior ([M01](M01-GAME-CORE.md)).
- Runtime routes/services ([M04](M04-CONNECTIVITY-SERVICE.md)).
- Airplane pairing ([M05](M05-AIRPLANE-MODE.md)).
- Community Skin package lifecycle ([M11](M11-COMMUNITY-SKINS.md)).

## User Stories

1. As a user, I want to see the exact build/protocol running at my table.
2. As a traveler, I want a verifiable standalone file that never self-updates during a trip/game.
3. As a maintainer, I want one source revision to produce traceable Table-side and Airplane artifacts.
4. As an open-source deployer, I want to configure my own domain, signaling, relays, backup, and diagnostics.
5. As Ruihe, I want Official Core/release provenance distinguished from arbitrary compatible forks.
6. As a security reviewer, I want no runtime third-party scripts, fonts, evaluators, QR libraries, analytics, or card assets in the card origin.
7. As a small deployer, I want the Table-side build usable from an ordinary free static HTTPS host without turning that host into the poker engine.

## Implementation Decisions

- Use Apache-2.0 for project-owned code and preserve licence/notice obligations. Skin asset licences are separate Phase 3 metadata.
- The canonical public identity is **Our Poker Table** in [`Cai-Ruihe/our-poker-table`](https://github.com/Cai-Ruihe/our-poker-table). The canonical production root is `https://ourpokertable.com/`; Table-side Mode is `https://ourpokertable.com/table-side/`.
- Keep the durable local workspace at `/Users/ruihecai/Developer/html-poker-app`, the root npm workspace identifier as `html-poker-app`, the `@html-poker/*` namespace, and existing protocol identifiers unchanged unless a future owner decision separately authorizes an implementation-level migration. Distribution naming is owned here; M06 and the brand package continue to own product-facing visual identity.
- GitHub redirects the old repository and Git transport URLs, but GitHub Pages does not redirect the former project-site path. Documentation, invitations, release notes, and handoffs must use the canonical `our-poker-table` Pages routes and treat the old Pages routes as invalid.
- The owner-authorized repository/Pages rename landed in [PR #7](https://github.com/Cai-Ruihe/our-poker-table/pull/7) at merge commit `28e7943b6472226f84ee24b693ed192338969989`. A name or route migration is provenance evidence, not an Official Release. At the migration read-back, the renamed Pages route still served `0.1.3-phase1` from source revision `07cf6ede1fa1ddd4eda09059cfd3d64018cde297`.
- Keep the Table-side build provider-neutral and static-hostable. GitHub Pages is the current owner-authorized field-build host; any future provider choice remains separate from the Connection Service and must pass target-region tests.
- Commit lockfiles and pin build inputs. Release metadata includes source revision, build environment/provenance, dependency inventory, artifact digest, signature, build/protocol/rules/schema versions, and release date.
- Treat a new service worker as waiting; never activate/migrate during an active table.
- A signature identifies an artifact from the official process. It cannot attest an unlocked/modified host, extension, operating system, or administrator.
- Official clients may join a Custom Host only after a clear one-time warning. Protocol compatibility is not a fairness guarantee.
- Do not embed Ruihe's server addresses/credentials as public defaults. Provide deployment examples using operator-supplied configuration.
- Repository publication and the Pages route migration are complete. Branch protection, release signing identity, Official Release approval, future hosting-provider changes, and Connection Service deployment remain separate explicit external-operation gates.

## Testing Decisions

Test reproducibility/determinism to the chosen level, dependency/artifact substitution, altered top-level HTML, signature/digest mismatch, downgrade/freeze/mixed assets, service-worker activation during play, incompatible schema migration, revoked builds, Table-side/Airplane parity, offline external-request scan, secret scan, licence inventory, and fresh-clone documentation paths. Before any public claim, read back the canonical repository and both Pages routes, reject stale former Pages links, and verify that the deployed manifest's version and source revision match the intended candidate.

## Out of Scope

Choosing a permanent managed hosting vendor, subsidizing community infrastructure, remote attestation of the running host, silently auto-updating tables, or treating a repository/route rename as an application release.

## Further Notes

The public GitHub repository and Pages field-build routes are active. Operational readiness still depends on candidate-matched manifests, China testing, release signing, and optional Connection Service deployment. These are deployment choices and evidence gates, not a central poker backend.
