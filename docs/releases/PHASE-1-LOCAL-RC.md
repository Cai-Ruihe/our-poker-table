# Phase 1 local release candidate

**Status:** Local candidate record, not an official release. **Audience:** the project owner and reviewers. **Update when:** the candidate changes or a listed external gate obtains dated evidence.

## Candidate scope

This candidate implements the Phase 1 trusted-host digital-dealer slice:
physical chips only; two to ten player seats; card/privacy projections; QR/link
capabilities; Table-side direct/relay connectivity; reverse public-display pairing;
standalone Airplane pairing; local encrypted recovery; diagnostics; and
off-table administration. The repository contains a separately labelled,
explicit-query Digital Chips development tracer, but it is not part of the
Phase 1 party path or release claim. Real money, remote-first human play,
automatic host migration, skins, and AI seats remain excluded.

## Local evidence to run and record

```sh
pnpm qa:release
pnpm test:coverage
CI=true pnpm exec playwright test tests/journey/airplane.spec.ts --project=chromium --grep "live camera frame" --repeat-each=10
pnpm licenses:prod
pnpm release:reproducibility
```

After committing the exact candidate and building it, create the ignored local receipt:

```sh
pnpm release:manifest
pnpm release:verify
```

The manifest contains the source revision, package-manager/Node metadata, lockfile digest, build/protocol version, and a SHA-256 entry for every Table-side and Airplane artifact file. It deliberately does not sign an artifact or publish anything.

## Release blockers still outside this repository run

| Gate | Status | Why it is not claimed |
|---|---|---|
| Physical device/browser matrix | Open | Local browser emulation and a synthetic camera QR stream are not actual iOS/iPadOS, Android, TV, camera, file-opening, backgrounding, or storage evidence. Headless Mobile WebKit and GitHub-hosted Linux Chromium expose no usable local ICE interface, so real direct-pairing remains a local Chromium test plus a physical-device gate rather than a fabricated hosted-CI pass. |
| WAN-removed Airplane matrix | Open | A desktop `file://` journey does not prove hotspot behavior, client-isolation detection, or two-to-ten real devices plus public display. |
| Table-side network/TURN/reconnect matrix | Open | Direct local candidates and local relay fallback do not establish NAT, TURN, network switch, long suspend, service restart, or throughput behavior. |
| Initial-load performance | Partial | `pnpm qa:performance` now blocks regressions above the recorded raw/gzip JavaScript, CSS, and Airplane artifact ceilings. The current Table-side JavaScript remains about 1,020 KB before compression (about 293 KB as reported by Vite) and emits the bundler's large-chunk warning. No physical device/network load, battery, memory, or camera-throughput budget has been measured, so those remain unsupported performance claims. |
| China readiness | Open | No dated representative mainland network measurements exist. |
| Independent Card Privacy Red Team | Open | Automated regressions exist; an independent frozen-candidate review does not. |
| Supply-chain release approval | Open | Audit/licence commands are local evidence only; no release signing identity, SBOM/provenance attestation, or owner approval is configured. |
| GitHub/security operations | Partial | Public source, an owner-authorized Pages field build after CI, Private Vulnerability Reporting, dependency alerts, and automatic security fixes are active. Protected branch rules, release signing, and a monitored response-time commitment remain open. |

## Honest label

Call this a **local Phase 1 release candidate** only. Do not call it “released,” “production-ready,” “China-ready,” “Airplane-supported,” or “secure against a malicious host” until the corresponding release checklist evidence is complete and owner-approved.
