# Privacy, network robustness, and update trust

- **Status:** Informative research baseline
- **Evidence reviewed:** 2026-08-14
- **Audience:** Maintainers, implementers, deployers, and Card Privacy Red Team reviewers
- **Authority:** This report explains evidence and design consequences. The [Decision Register](../prd/reference/DECISION-REGISTER.md), accepted ADRs, PRDs, and approved tests are normative.
- **Update trigger:** Refresh before implementing or releasing the affected modules, after a security incident, or when the host-custody, bootstrap, deployment-region, update, recovery, or AI trust model changes.

## Executive conclusion

The architecture is coherent only with a deliberately narrow security claim:

> Signaling, relay, checkpoint storage, diagnostics, display devices, and other seats must not receive hidden-card plaintext or card keys. The active Trusted Host can read and alter the deck by design. An Official Release signature establishes provenance; it does not prove that a running host or its operating system is honest.

The accepted baseline is:

1. Table-side Mode tries **direct peer-to-peer → deployer private relay → deployer cloud relay**. Each deployment owns its endpoints, credentials, and costs.
2. Every QR or equivalent full-URL invitation authenticates the host independently of signaling. Transport encryption without peer binding is insufficient.
3. The Connection Service is card-blind, not metadata-blind. It may signal, relay ciphertext, store opaque checkpoints, and retain allowlisted redacted diagnostics; it never runs poker rules.
4. Official Table-side and Airplane artifacts are immutable, dependency-locked, provenance-verifiable, and free of runtime third-party code. A live table never changes build or protocol.
5. Airplane Mode is a preloaded, self-contained artifact using a trusted non-isolating local network and two-way on-screen QR. It makes zero external requests during play.
6. China-ready operation is a goal, not a current claim. Online routes require dated field evidence; Airplane Mode is the worst-case fallback.
7. Connection Service and future AI Gateway processes may share one Windows or Mac only with separate least-privilege identities, secrets, state, logs, and network policy. Administrator or operating-system compromise remains common fate.
8. Phase 1 trusts the host. A future Mental Poker implementation is the recorded route to changing card custody, but it requires a different cryptographic protocol and review.

No unresolved owner-level conflict was found in this scope. Remaining uncertainty belongs in named test gates, not repeated preference questions.

## Research receipt and method

```text
FOUNDATION_RESEARCH_V1
Scope: Release/update trust, Airplane Mode, mainland-China operation, key recovery, card-blind signaling and relays, co-located Connection Service and AI Gateway, and Trusted Host compromise.
Evidence date: 2026-08-14.
Industrial evidence: First-party product and cloud-provider documentation.
Open-source evidence: Source and tests inspected at pinned commits for Tehes/poker, Poki netlib, and predatorray/mental-texas-holdem.
Standards evidence: IETF, W3C, NIST, TUF, SLSA, and OWASP primary or official publications.
Academic evidence: Foundational Mental Poker work, used only to establish the change in custody model.
Decision search: Decision Register, ADR-0001, ADR-0003, ADR-0005, ADR-0006, Quality Gates, Release Checklist, and Evidence Index.
Result: No OPEN—MAJOR decision. Research defaults and test gates cover the unresolved implementation facts.
```

Evidence was treated conservatively:

- A product page establishes what its publisher describes, not its undisclosed protocol or security.
- A pinned repository establishes what the inspected revision contains, not production suitability.
- A standard establishes protocol properties and threat assumptions, not support on every browser, router, airline, or mainland network.
- A cloud-provider page is useful operational evidence, not legal advice.
- Security controls reduce defined attacks; they do not justify a claim of perfect security.

## Decision disposition

| Area | Controlling decision | Classification | Result |
|---|---|---|---|
| Trusted Host and future host blindness | `AUTH-TRUSTED-HOST`, `AUTH-FUTURE-MENTAL-POKER` | **LOCKED** | Phase 1 host can read the deck; preserve a replaceable Card Custody seam. |
| Connection-only infrastructure | `SERVER-CONNECTION-ONLY`, `PRIVACY-TRUST-CLAIM` | **LOCKED** | Services never receive card plaintext or keys. |
| Connectivity ladder and ownership | `NET-ROUTE`, `NET-OWNER-ISOLATION` | **LOCKED** | Direct, then deployer private relay, then deployer cloud relay. |
| Universal bootstrap and peer binding | `NET-BOOTSTRAP`, `NET-HOST-KEY-BINDING` | **LOCKED** + **RESEARCH-DEFAULT** | QR/full URL; bind host identity independently of signaling without another comparison prompt. |
| Airplane Mode | `NET-AIRPLANE`, `NET-VERSION` | **LOCKED** | Self-contained compatible artifacts, local network, two-way QR, no service dependency. |
| China operation | `NET-CHINA` | **LOCKED** goal + **TEST—DO NOT ASK** | Do not claim readiness before `TEST-CHINA-NETWORKS`; retain Airplane fallback. |
| Release/update model | `SUPPLYCHAIN-IMMUTABLE-RELEASE`, `NET-VERSION` | **RESEARCH-DEFAULT** + **LOCKED** | Immutable self-contained artifacts; updates only between tables. |
| Key and recovery separation | `KEY-SEPARATION-RECOVERY`, `BACKUP-HAND-END` | **RESEARCH-DEFAULT** + **LOCKED** | Purpose-separated keys; opaque hand-end checkpoints; recovery material stored separately. |
| Co-located Connection Service / AI Gateway | `AI-GATEWAY-COLOCATION`, `AI-CLOUD-TRUST` | **LOCKED** + **DEFERRED** | Process isolation is required; remote AI disclosure remains a future owner gate. |
| Implementation effectiveness | named gates in the Decision Register | **TEST—DO NOT ASK** | Device, network, storage, compromise, supply-chain, and AI isolation results remain unverified. |

See [ADR-0001](../adr/0001-trusted-host-now-mental-poker-seam.md), [ADR-0005](../adr/0005-deployer-owned-connectivity-ladder.md), and [ADR-0006](../adr/0006-standalone-airplane-mode.md) for the accepted architectural choices.

## Assets, actors, and trust boundaries

### Assets

- Unrevealed hole cards and future deck order
- Authoritative event log, revision, rules profile, and hand state
- Host identity and table-control capabilities
- Seat Credentials and private-envelope keys
- Local-vault and checkpoint-recovery keys
- TURN, service, signing, update, diagnostic, and future AI-provider credentials
- Release source, dependency graph, build provenance, artifacts, and migrations
- Redacted diagnostics whose correlation can still expose participant or network metadata

### Boundary model

| Component | May know or do | Must not know or do |
|---|---|---|
| Trusted Host | Authoritative rules and readable live Card Custody | Claim fairness against its own operator or operating system |
| Player seat | Its own private projection and permitted commands | Other seats' hidden cards, future deck, or host authority |
| Public/Tablet/TV view | Public projection and explicitly granted controls | Hidden cards or self-upgraded capabilities |
| Signaling service | Temporary rendezvous records and routing metadata | Choose an unverified host identity or receive card plaintext/keys |
| TURN/private/cloud relay | Forward encrypted packets; observe necessary transport metadata | Decrypt card envelopes, run poker rules, or retain long-lived browser-visible service secrets |
| Checkpoint store | Opaque authenticated blobs and minimal version metadata | Recovery material stored beside ciphertext or completed-hand hidden-card residue |
| Update origin | Publish immutable identified releases | Replace a live table or execute unpinned third-party code in the card origin |
| AI Gateway, future | Provider credentials and an authorized AI seat projection | Signaling/TURN/checkpoint secrets, other seats' cards, or authoritative event commits |

## 1. Update and supply-chain model

### Facts

- [NIST SP 800-218 SSDF v1.1](https://csrc.nist.gov/pubs/sp/800/218/final) was finalized on 2022-02-03 and defines secure-development practices spanning acquired components, integrity, vulnerability response, and software production.
- [SLSA Provenance v1.2](https://slsa.dev/spec/v1.2/provenance) defines verifiable information linking a software artifact to how it was produced.
- [The Update Framework specification](https://theupdateframework.github.io/specification/) models arbitrary-update, rollback, freeze, mix-and-match, and key-compromise attacks. The associated [Cappos et al. CCS 2010 paper](https://theupdateframework.io/papers/survivable-key-compromise-ccs2010.pdf) explains why survivable update trust needs more than a single artifact signature.
- The [W3C Service Workers specification](https://www.w3.org/TR/service-workers/) defines installing, waiting, and active workers. That lifecycle permits staging a replacement rather than changing the controller immediately.
- [W3C Subresource Integrity](https://www.w3.org/TR/SRI/) checks referenced subresources. It does not rescue a hostile top-level document that can supply its own script references and hashes.
- At inspected Tehes/poker revision [`8452681391b4753089cb8e74bee79d89ef6f0e67`](https://github.com/Tehes/poker/tree/8452681391b4753089cb8e74bee79d89ef6f0e67), the [documented offline design](https://github.com/Tehes/poker/blob/8452681391b4753089cb8e74bee79d89ef6f0e67/README.md#L101-L145) caches application assets and activates newer assets through its Service Worker workflow. This is evidence that offline caching works as a pattern, not permission to update a live authoritative table.

### Inference and accepted default

- Build deterministic or provenance-verifiable, immutable Table-side and Airplane artifacts from exact dependency and toolchain locks.
- Bundle every runtime script, evaluator, QR library, font, card asset, and skin validator locally. Do not load executable code or mutable assets from a CDN in the card origin.
- Publish an artifact digest, signed release metadata, source revision, dependency inventory/SBOM, provenance, build ID, and supported protocol/schema range.
- Treat CSP, Trusted Types, and SRI as defense in depth. The separately authenticated Official Release artifact is the trust root.
- Let a new Service Worker install and wait. Activate it only when no table is active and required migrations have passed. Never force an immediate controller change during play.
- `poker-airplane.html` never self-updates. Users replace it before travel, can see its build ID and age, and pairing rejects incompatible protocol/schema ranges.
- Do not impose an internet-dependent expiry on an already verified compatible Airplane artifact; that would defeat the locked offline fallback.
- Preserve the Custom Host warning. A signature identifies an Official Release but does not remotely attest the runtime, extensions, DevTools, or host operating system.

### Unknowns and test evidence

The exact package manager, signer custody, build platform, reproducibility target, SBOM format, release transparency mechanism, and schema migration process remain implementation choices. `TEST-UPDATE-SUPPLY-CHAIN` must cover:

- modified top-level HTML and substituted dependencies/assets;
- invalid, revoked, missing, or mismatched release metadata;
- downgrade, freeze, mix-and-match, and stale-cache behavior;
- worker activation or database migration during an active table;
- incompatible Table-side/Airplane builds and protocol boundaries;
- rollback to a known-good artifact without mutating the current table.

## 2. Airplane Mode and mainland-China operation

### Facts

- The [W3C WebRTC API](https://www.w3.org/TR/webrtc/) does not prescribe the application's signaling transport.
- Browser treatment of local files, secure contexts, camera permission, persistent storage, backgrounding, and local-network access is platform-specific. Standards do not establish the required iOS, Android, desktop, tablet, or TV support matrix.
- [Microsoft's Azure China cross-border guidance](https://learn.microsoft.com/en-us/azure/china/overview-connectivity-and-interoperability), last updated 2025-05-13, describes cross-border connectivity as unpredictable and reports materially higher latency in its Azure-specific comparison.
- [Alibaba Cloud's ICP scenario guidance](https://www.alibabacloud.com/help/en/icp-filing/basic-icp-service/product-overview/faq-about-icp-filing-applications-in-different-scenarios), updated 2025-06-13, ties mainland ICP filing to a domain resolving to a server in mainland China. It also names other possible filing obligations. This is provider guidance, not a complete legal determination.
- [Bold Poker's first-party help](https://boldpoker.net/help) describes nearby play, same-Wi-Fi requirements for Android, and Bluetooth discovery on iOS. It does not document a browser protocol, host-loss recovery, cross-internet routing, or China support.

### Inference and accepted default

- Table-side Mode implements a tested `ConnectivityStrategy`: direct WebRTC first, then the deployer's private relay, then its optional cloud relay. ICE alone must not be assumed to enforce this business order in every situation.
- In Airplane Mode, exchange offer/answer bootstrap data through two-way on-screen QR rather than relying on an internet signaling service.
- A private relay physically outside mainland China does not become mainland-hosted merely because a traveler connects to it. That narrow hosting fact does not establish reachability, performance, content legality, data-transfer compliance, or every registration obligation.
- A mainland-hosted relay is not a required baseline. If a deployer chooses one, provider eligibility, registration, content, data handling, and operations require a deployment-specific review.
- Airplane Mode is the worst-case operational fallback: every device preloads a compatible artifact, joins a trusted non-isolating Wi-Fi/hotspot, performs two-way QR pairing, and makes zero internet requests.
- “China ready” remains unclaimed until representative online tests pass. Successful use on one hotel, carrier, VPN, or home network is not sufficient evidence.

### Unknowns, corner cases, and test evidence

`TEST-CHINA-NETWORKS` must measure representative mainland fixed, mobile, hotel, and enterprise networks against deployer private and cloud relays. Include DNS and TLS reachability, UDP and TCP/TLS TURN, cross-border latency/loss, network switching, reconnect, and service onboarding. Record date, city/region, carrier, device, browser, endpoint region, route chosen, and failure class.

`TEST-IOS-STANDALONE`, `TEST-TV-BROWSERS`, and `TEST-WEBRTC-STAGING` must include:

- two to ten player seats plus the host and at least one Public Table device, with WAN physically unavailable;
- `iceServers: []` and network inspection proving zero external requests;
- two-way QR only, including expired, replayed, wrong-table, and wrong-version payloads;
- iOS/iPadOS local-file launch, camera permission, storage durability, refresh, and background/resume;
- Android, Windows, macOS, tablet, and selected TV-browser journeys;
- hotspot or access-point client isolation, captive portals, local-address permission, and multicast assumptions;
- incompatible artifacts, player re-pairing, host recovery import, and deliberate host loss;
- an honest failure screen when the local network blocks peer-to-peer traffic.

Airplane Mode is a fallback path, not a promise that every aircraft network or phone hotspot permits local client traffic.

## 3. Host authentication, signaling, and relay blindness

### Facts

- [RFC 8831, WebRTC Data Channels](https://www.rfc-editor.org/rfc/rfc8831.html) specifies SCTP over DTLS for data-channel transport.
- [RFC 8827, WebRTC Security Architecture](https://www.rfc-editor.org/rfc/rfc8827.html), published January 2021, roots its guarantees in the browser and separates peer identity from signaling. An encrypted channel to an attacker is still the wrong channel if signaling can substitute the peer identity or fingerprint.
- [RFC 8656, TURN](https://www.rfc-editor.org/rfc/rfc8656.html), published February 2020, defines a packet relay with allocation, authentication, and observable routing metadata. TURN is not a poker privacy protocol.
- At Poki netlib revision [`44c9d0746799c51bf9c652c57162e8b273ed3901`](https://github.com/poki/netlib/tree/44c9d0746799c51bf9c652c57162e8b273ed3901), [reconnection scenarios](https://github.com/poki/netlib/blob/44c9d0746799c51bf9c652c57162e8b273ed3901/features/reconnect.feature#L1-L97) exercise WebRTC and signaling reconnects. Its [signaling lifecycle](https://github.com/poki/netlib/blob/44c9d0746799c51bf9c652c57162e8b273ed3901/lib/signaling.ts#L11-L125) resumes with an identifier/secret and version, while its [Cloudflare credential service](https://github.com/poki/netlib/blob/44c9d0746799c51bf9c652c57162e8b273ed3901/internal/cloudflare/credentials.go#L18-L116) keeps the provider authorization key in the server process and obtains time-limited TURN credentials.

### Inference and accepted default

- Every Table-side or Airplane invitation contains a one-use high-entropy capability and a cryptographic binding over table ID, active host public key, role/scope, protocol version, expiry, and nonce.
- The joining client verifies that binding independently of signaling before seat activation or private-card delivery. The full QR/URL does this automatically; there is no extra approval screen or short human comparison code.
- Signaling accepts size-limited, schema-validated rendezvous objects. It cannot select a different authenticated host, escalate role scope, or replay an expired invitation.
- Relays see addresses, timing, sizes, connection identifiers, and availability patterns. They can delay, drop, replay, or deny ciphertext unless the application detects stale/replayed state. “Card-blind” therefore never means “metadata-blind” or “availability-neutral.”
- Long-lived TURN/provider credentials stay in the deployer-controlled service. Browsers receive only scoped, short-lived relay authorization.
- The three-stage route remains a project policy above WebRTC/ICE. A library's generic fallback and reconnect behavior does not establish poker authority, credential recovery, or the required route order.

### Unknowns and test evidence

Put signaling and relay infrastructure under attacker control. `TEST-WEBRTC-STAGING` and `TEST-REMOTE-COMPROMISE` must test:

- substituted host keys/fingerprints and wrong-origin signaling;
- replayed, expired, wrong-table, wrong-role, and wrong-version invitations;
- duplicated peers, stale candidates, ICE restart, network switching, and reconnect races;
- malicious, oversized, deeply nested, or out-of-order signaling messages;
- stolen short-lived TURN credentials and attempted extraction of long-lived credentials;
- ciphertext replay, packet reordering, checkpoint rollback, and denial of service;
- logs, errors, metrics, URLs, and crash output for secret or hidden-card leakage.

## 4. Key management, refresh, and recovery

### Facts

- [NIST's key-management guidance](https://csrc.nist.gov/Projects/Key-Management/Key-Management-Guidelines) treats key purpose, protection, lifecycle, compromise, recovery, and destruction as distinct design concerns.
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) recommends least privilege, creation/rotation/revocation/expiry, short-lived credentials where possible, and secret-free logs.
- [W3C Web Cryptography security considerations](https://www.w3.org/TR/webcrypto-2/#security-considerations-for-authors) do not define a universal hardware-protected browser vault. Hostile same-origin code can invoke cryptographic operations that legitimate application code is allowed to use.
- Browser storage can be cleared, evicted, corrupted, or unavailable. A display name is not a recovery credential.

### Inference and accepted default

Use separate material for at least these purposes:

| Purpose | Required separation |
|---|---|
| Table identity/signing | Ephemeral identity that invitations bind to the active host |
| Seat resumption | Unique revocable Seat Credential; never recover by name alone |
| Private-card delivery | Per-seat private-envelope key/material |
| Host local persistence | Local-vault key protecting stored authoritative state |
| Remote checkpoint recovery | High-entropy recovery material kept separately from stored ciphertext |
| TURN/service access | Service-held long-term credential and scoped short-lived browser authorization |
| Diagnostics | Pseudonymization secret that cannot decrypt card or checkpoint data |
| Future AI | Provider credential isolated inside the AI Gateway |

- Never embed long-lived credentials or private keys in static HTML, invitation URLs/QR, peer messages, checkpoint blobs, support bundles, or logs.
- Write authoritative state before acknowledging irreversible actions. Recovery accepts only a single proven current authority and fails closed on split-brain ambiguity.
- The optional remote checkpoint is authenticated ciphertext. At explicit hand end, remove folded/unrevealed completed-hand cards, legacy-mucked cards, and obsolete custody material before upload.
- Claim cross-device remote recovery only after the host explicitly confirms or exports the separate recovery material. If the only recovery secret is lost, the checkpoint is intentionally unrecoverable; Phase 1 already accepts that permanent host loss may end the game.
- Rotate and compact keys/checkpoints at a hand boundary, never in the middle of custody transitions.

### Unknowns and test evidence

`TEST-STORAGE-KEYS`, `TEST-HOST-EXCLUSIVITY`, and `TEST-CORRECTION-REPLAY` must determine:

- persistence and protection across supported browser/OS combinations;
- behavior after refresh, power loss, quota pressure, storage clearing, backup restore, and clock changes;
- whether exported recovery material is usable, revocable where applicable, and never silently escrowed;
- checkpoint tamper, truncation, rollback, duplicate upload, version mismatch, and partial write;
- seat replacement rotation and rejection of a copied or revoked Seat Credential;
- proof that two host writers cannot both resume authority.

## 5. Connection Service and AI Gateway on one machine

### Facts

- [NIST SP 800-53 Rev. 5](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final) includes least-privilege and process-isolation controls. Process isolation reduces propagation; it does not turn one operating system into two physically independent trust domains.
- [ADR-0003](../adr/0003-provider-neutral-ai-seat-boundary.md) keeps long-lived provider credentials out of browsers and constrains AI to a seat-scoped proposal interface. Remote AI card disclosure remains deferred.

### Inference and accepted default

If both services share a Windows desktop or Mac mini:

- run distinct binaries/processes under distinct least-privilege OS identities;
- use separate data directories, ACLs, ports, service definitions, secret stores, environment/configuration, update channels, and log sinks;
- apply separate inbound and outbound allowlists;
- share no environment file, database, writable directory, tracing exporter, crash collector, generic proxy, or administrator token;
- give the Connection Service only strict signaling, short-lived relay-credential, opaque-checkpoint, and redacted-diagnostic schemas;
- give the AI Gateway only an authenticated seat-scoped request and untrusted action-proposal response after the Phase 3 gate;
- keep the Connection Service unable to decode cards or access AI credentials, and the AI Gateway unable to access signaling/TURN/checkpoint state or commit authoritative events.

A machine administrator, kernel/OS malware, shared-account compromise, host-browser compromise, or insecure shared updater may cross both boundaries. Co-location is operational isolation and blast-radius reduction, not independent physical trust.

### Unknowns and test evidence

Exact Windows service accounts, macOS sandboxing, local IPC authentication, firewall rules, secret stores, installers/updaters, and observability stacks remain implementation decisions.

Extend `TEST-REMOTE-COMPROMISE` and `TEST-AI-SEAT-SAFETY` to compromise each service account in turn and inspect its filesystem, process, network, logs, backups, crash dumps, and updater. Prove the intended cross-service denials. Administrator compromise should be recorded as an expected boundary failure, not disguised as a passing isolation test.

## 6. Trusted Host compromise and future Mental Poker

### Facts

- RFC 8827 states that a compromised browser cannot provide the expected WebRTC security guarantees. Web Crypto likewise cannot protect secrets from hostile same-origin code that can call authorized cryptographic operations.
- At predatorray/mental-texas-holdem revision [`54ce0e88adbde24c8219f7ee0ba00e3d8af8eafa`](https://github.com/predatorray/mental-texas-holdem/tree/54ce0e88adbde24c8219f7ee0ba00e3d8af8eafa), [exportable private keys and a build-injected TURN-provider key](https://github.com/predatorray/mental-texas-holdem/blob/54ce0e88adbde24c8219f7ee0ba00e3d8af8eafa/src/lib/setup.ts#L36-L109) and [individual card decryption keys in `sessionStorage`](https://github.com/predatorray/mental-texas-holdem/blob/54ce0e88adbde24c8219f7ee0ba00e3d8af8eafa/src/lib/MentalPokerGameRoom.ts#L86-L107) demonstrate patterns this project must not copy.
- Shamir, Rivest, and Adleman's foundational [Mental Poker paper](https://people.csail.mit.edu/rivest/pubs/SRA81.pdf) distributes cryptographic work so card dealing need not rely on one ordinary trusted dealer. Such protocols add verifiable shuffle/decryption, collusion, performance, and participant-dropout concerns.

### Practical compromise assessment

| Attacker position | Hidden-card impact under the target design |
|---|---|
| Copies public HTML only | No live cards, keys, or table state should be present. This must be verified by artifact and secret scans. |
| Captures network packets | DTLS/application encryption should prevent plaintext; addresses, timing, sizes, and routing remain observable. |
| Compromises signaling only | Can disrupt or redirect unless the invitation independently binds the host. With correct binding, substitution must fail before private delivery. |
| Compromises relay/checkpoint storage only | Can observe metadata, deny service, or replay stale ciphertext; must not decrypt cards without separately held keys. |
| Executes hostile same-origin code on the host | Can usually invoke the host's decryption/state operations and exfiltrate the live deck. This is a critical prevention target, not a boundary the Phase 1 protocol can survive. |
| Gains privileged extension, unlocked DevTools/device, administrator, or OS malware access | Can read or manipulate host plaintext while it is in use. Phase 1 provides no fairness guarantee against this foothold. |
| Runs a deliberately modified Custom Host | Controls game truth and deck by design. Official clients must display the unverified-host warning. |

### Inference and accepted default

- CSP, Trusted Types, text-only rendering, schema validation, no runtime third-party code, a narrow dedicated card worker, encrypted persistence, immutable releases, and red-team testing reduce remote and accidental compromise.
- Package static HTML without live table state or secrets so copying the public artifact alone cannot disclose cards from an unrelated live table.
- None of those controls make the active host blind. Marketing and UI must not imply cryptographic fairness against the host.
- Mental Poker remains a replaceable Card Custody option for later research. It cannot be introduced as a small shuffle-library swap; it needs its own protocol, collusion model, dropout/recovery design, performance prototype, and independent cryptographic review under `TEST-MENTAL-POKER`.

### Unknowns and test evidence

The exploitability of the eventual implementation is unknown. `TEST-REMOTE-COMPROMISE` and every phase's independent Card Privacy Red Team must attack supply-chain injection, XSS/DOM injection, hostile peers, storage, replay, checkpoints, diagnostics, extensions, service compromise, and release/update boundaries. Findings end in a fix, explicit accepted risk, or release block—never a claim of perfect security.

## 7. Competitor and inspected-source synthesis

| Evidence | Fact observed | What transfers | What does not transfer |
|---|---|---|---|
| [Bold Poker](https://boldpoker.net/) and [help](https://boldpoker.net/help), accessed 2026-08-14 | Public iPad board, private player devices, deal-only physical-chip play, compact gestures, nearby Wi-Fi/Bluetooth guidance | Product-role separation, minimal in-hand surface, explicit reveal behavior | Its undisclosed transport/recovery implementation, browser compatibility, host-blindness, internet fallback, or China readiness |
| [Smart Dealer Poker](https://smartdealer.poker/), accessed 2026-08-14 | Browser table/TV view, private phone app, six-digit join, tracked chips/replays; first party says internet and a central server are required | Multi-surface precedent and later accounting/replay ideas | Its central-server dependency, account/history choices, or short join code as the security design |
| [Cardamoo](https://cardamoo.com/), accessed 2026-08-14 | No-account browser play with virtual non-cash chips and link/room-code joining | No-real-money boundary and low-friction web access | Evidence for in-person card custody, offline play, or card-blind relay architecture |
| [Tehes/poker at `8452681`](https://github.com/Tehes/poker/tree/8452681391b4753089cb8e74bee79d89ef6f0e67) | QR/link companion views, cached offline operation, background Service Worker updates, and a fallback that can embed hole-card data in QR | Offline caching and responsive web precedent | Background activation during a table and hidden-card material in an invitation are rejected for this threat model |
| [Poki netlib at `44c9d07`](https://github.com/poki/netlib/tree/44c9d0746799c51bf9c652c57162e8b273ed3901) | WebRTC reconnect tests, signaling lifecycle, and server-held TURN-provider authorization | Test shapes, replaceable transport adapter, short-lived browser relay credentials | Poker authority, host identity binding, exact three-stage policy, and China readiness |
| [mental-texas-holdem at `54ce0e8`](https://github.com/predatorray/mental-texas-holdem/tree/54ce0e88adbde24c8219f7ee0ba00e3d8af8eafa) | Experimental distributed card cryptography plus exportable keys in browser session storage and a static-bundle provider key | Evidence that host blindness changes the custody protocol | Its credential/key-storage patterns and production-security fitness |
| [Shamir–Rivest–Adleman](https://people.csail.mit.edu/rivest/pubs/SRA81.pdf) | Foundational cryptographic direction for playing over distance without one ordinary trusted dealer | Future Card Custody research basis | A ready production protocol for modern browsers, dropout, recovery, or collusion |

No cited product proves this complete architecture. In particular, observed recovery in a commercial app cannot identify whether it used local persistence, server state, transport reconnection, or another mechanism.

## 8. Named evidence gates

These are tests, not user-preference questions:

| Gate | Minimum evidence for this scope |
|---|---|
| `TEST-UPDATE-SUPPLY-CHAIN` | Artifact/dependency substitution, top-level HTML tamper, downgrade/freeze/mix-and-match, worker activation, migration, rollback, incompatible Airplane builds |
| `TEST-IOS-STANDALONE` | Real iPhone/iPad local artifact, camera, local-network permission, storage, refresh, background/resume, and zero-internet journey |
| `TEST-TV-BROWSERS` | Selected TV input, QR, lifecycle, storage, WebRTC, failure, and display-only capability matrix |
| `TEST-CHINA-NETWORKS` | Dated representative mainland fixed/mobile/hotel/private/cloud route measurements with DNS/TLS/UDP/TCP and reconnect evidence |
| `TEST-WEBRTC-STAGING` | Direct/private/cloud order, signaling compromise, TURN fallback, ICE restart, network switch, reconnect, replay, and service denial |
| `TEST-STORAGE-KEYS` | Browser/OS key persistence, clearing, export/recovery, encryption, rollback, leakage, and destruction attacks |
| `TEST-HOST-EXCLUSIVITY` | Fault evidence that two host writers cannot both resume authority |
| `TEST-CORRECTION-REPLAY` | Persist-before-ack, crash, duplicate, race, idempotency, digest, quota, checkpoint, and replay equivalence |
| `TEST-REMOTE-COMPROMISE` | Threat model, dependency review, fuzzing, service/process isolation, secret canaries, phase Red Team, and penetration evidence |
| `TEST-AI-SEAT-SAFETY` | Co-located-process isolation plus projection, cross-seat, injection, stale/illegal response, timeout, log, and provider-secret controls |
| `TEST-MENTAL-POKER` | Separate protocol, performance, dropout, recovery, collusion, and independent cryptographic review |

The [Quality Gates](../quality/QUALITY-GATES.md) and [Official Release Checklist](../releasing/RELEASE-CHECKLIST.md) define how evidence is recorded and when unverified claims block release.

## 9. Open facts, not open preferences

### Facts established by sources or accepted architecture

- WebRTC DataChannels protect transport with DTLS, but peer identity still needs an independent binding.
- A relay can remain card-blind while observing metadata and affecting availability.
- Browser cryptography cannot protect live plaintext from hostile code executing with the host application's authority.
- Service Worker lifecycle supports staged updates.
- Mainland cross-border behavior and hosting/filing constraints require deployment-specific evidence.
- Mental Poker is a different custody protocol, not stronger encryption around the same trusted host.

### Inferences accepted as defaults

- Bind the host key in every invitation automatically.
- Pin the table's release/protocol and activate updates only between tables.
- Keep Official artifacts immutable, self-contained, dependency-locked, and free of runtime third-party code.
- Separate every key and service credential by purpose; never escrow recovery material beside checkpoint ciphertext.
- Keep relays and checkpoints card-blind and diagnostics allowlisted/redacted.
- Isolate co-located services while stating their shared-machine failure boundary honestly.
- Use Airplane Mode as the no-internet fallback and withhold China claims until field evidence passes.

### Unknowns that must remain labeled

- Actual support across target iOS, Android, desktop, tablet, TV, router, hotspot, and airline combinations
- Current mainland reachability, latency, provider eligibility, and applicable legal/filing obligations for a chosen deployment
- Browser/OS key persistence and recovery behavior
- Effectiveness of the eventual code against supply-chain, same-origin, malicious-peer, rollback, service, and host-device attacks
- Whether a future Mental Poker protocol can meet mobile performance and dropout/recovery requirements
- Whether a future remote AI provider may receive an AI seat's private cards; this remains the explicit Phase 3 `AI-CLOUD-TRUST` owner gate

## References and evidence boundary

The repository's maintained source list is the [Evidence Index](../prd/reference/EVIDENCE-INDEX.md). This report intentionally cites primary standards, first-party product/provider pages, pinned inspected source, and foundational academic work. Source availability, provider rules, browser behavior, and network conditions can change; refresh them at the update triggers above.

This report does not establish implementation correctness, China readiness, legal compliance, host-blind fairness, or perfect security. Those claims remain prohibited until the corresponding evidence gates pass.
