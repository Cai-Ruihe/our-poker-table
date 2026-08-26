# Product QA system

This is the durable operating manual for Our Poker Table quality assurance. It is independent of a chat history or agent context window and is normative under [ADR-0008](../adr/0008-traceable-release-blocking-qa.md). The public repository uses `our-poker-table`; the local workspace, npm/package namespace, and protocol identifiers intentionally retain their established `html-poker-*` compatibility names.

## Authority model

`qa-registry.yaml` imports requirements rather than copying them:

- every numbered item under **User Stories** and every item under **Testing Decisions** in the Master, phase, and module PRDs;
- every stable ID in the Decision Register;
- every TUI ID in the approved Tablet feedback record;
- every feedback ID in the field-feedback ledger.

`pnpm qa:registry` compares the registry with the PRD manifest and source documents. Adding a source, story, decision, or feedback item without a coverage route fails the gate. Phase 2/3 items may be `deferred`, but they may not disappear.

## Evidence layers

| Layer               | Proves                                                                    | Cannot prove                                |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| Static and registry | source completeness, types, links, declared evidence routes               | runtime behavior or visual quality          |
| Contract            | deterministic rules, authority, persistence, privacy projections          | browser layout, camera, OS lifecycle        |
| Browser behavior    | public user journeys, semantics, interactions, recovery                   | exact physical hardware/network behavior    |
| Geometry and visual | approved size, spacing, orientation, overflow, rendered hierarchy         | real camera/network/suspension behavior     |
| Accessibility       | automated axe checks, names, keyboard paths, reduced motion, target sizes | full assistive-technology usability         |
| Privacy red team    | negative disclosure and hostile-input evidence                            | perfect security                            |
| Physical field      | candidate behavior on named devices/networks                              | untested devices or future browser releases |
| Deployed read-back  | the public URL serves the intended candidate and manifest                 | long-term uptime or China readiness         |

No layer may be used as a substitute for a different layer.

## Brand identity protocol

The accepted identity authority is [DESIGN-OUR-POKER-TABLE-BRAND-V1](../design/brand/README.md); screenshots and chat history are not asset sources. `assets/brand/` is the canonical package, and `pnpm brand:verify` blocks release when any source-controlled brand file differs from its SHA-256 manifest.

For every release:

1. Browser-visible product naming and public repository/Pages links use **Our Poker Table** and `our-poker-table`. The local workspace, root npm identifier, `@html-poker/*` packages, and existing protocol identifiers retain `html-poker-*` unless a separate implementation-level migration is approved.
2. Entry, lobby, join, and pairing headers use the supplied light-surface lockup at its approved minimum or the supplied symbol below that width. The wordmark is never retyped, auto-traced, stretched, recolored, or reconstructed from a guessed font.
3. In-hand dark surfaces use the supplied gold symbol. Quiet Tablet/Public/TV play remains card-first; branding may not add a toolbar, title block, or decorative distraction to the quiet surface.
4. Browser title, favicon, and standalone Airplane title are asserted. The Airplane artifact must embed its identity and still make zero external requests.
5. Phone Home and Host screenshots remain release baselines, while `tests/journey/branding.spec.ts` asserts the semantic identity and removal of the former UI-facing name.
6. Theme and logo colors use Brand Green `#194C3E`, Table Felt `#003F33`, UI Gold `#D4B86E`, Warm Paper `#F5F5F5`, and Ink `#1D2321` only in the pairings approved by the brand guide.

## Visual conformance protocol

For every changed role/state:

1. Render the frozen candidate at its registry viewports.
2. Assert semantic names and absence of rejected labels/symbols.
3. Assert bounding boxes, gaps, orientation, touch targets, clipping, and horizontal overflow.
4. Compare deterministic screenshots. Dynamic identifiers and timers may be masked only when a separate assertion covers the masked content. Primary card surfaces are rendered with deterministic test entropy rather than hidden, so typography, pips, alignment, dimensional layers, and best-five emphasis remain visible evidence.
5. Inspect the produced images at full resolution before accepting a baseline.
6. Run the interaction in Chromium and WebKit. Pixel baselines remain deterministic-Chromium evidence unless a second engine has a stable checked-in baseline. Darwin and Linux keep separate reviewed Chromium baselines; cross-platform differences may not be hidden by widening the pixel threshold.
7. Run the small-phone, iPad landscape, desktop, and TV-width matrix named in the registry.

When browser QA fails in CI, the workflow retains the Playwright HTML report, actual image, diff image, failure screenshots, error context, and trace for 14 days. A visual failure may not be classified, re-baselined, or waived from log text alone; the retained expected/actual/diff evidence must be inspected first.

For menus and dialogs, existence is not functional coverage. Tests open every layer, invoke every available action, assert the resulting view/state, and verify that unavailable actions are disabled with an explicit capability explanation.

Every Tablet secondary action has a stable `data-qa-action` ID imported by `qa-registry.yaml`. Registry validation fails when an action is missing from the implementation or from an invoking journey. The browser test also compares the complete rendered action inventory, so adding a control without adding its result assertion blocks release. The registry separately names every required visual baseline and fails when a baseline call or Darwin/Linux image is absent. Actual Tablet player administration is both operated and screenshot-compared; opening a placeholder or merely finding the menu label cannot pass.

Baseline changes require a controlling decision/feedback reference and review. `--update-snapshots` is never a repair command.

Field feedback is authoritative in [FIELD-FEEDBACK-LEDGER.md](FIELD-FEEDBACK-LEDGER.md). A feedback item cannot be marked covered solely because a locator exists or a click succeeds: its registry route must include the affected deterministic rule, browser result, or visual/geometry evidence. Screenshot-visible feedback must retain an inspected baseline; physical Safari, iOS, Android, camera, suspension, or network reports additionally keep a named field verification rather than being silently inferred from a browser simulation.

### Tablet release contract

- Quiet mode contains cards and low-key edge status only—no Board label, counter, table oval, permanent toolbar, player tiles, lock, END, pause bars, or broken-ring symbol.
- Five cards use nearly the full safe width at the 1366×1024 reference viewport. Warm ivory, old-school typography, subtle dimensional layers, and aligned mirrored corners are retained.
- D, SB, and BB are distinct, readable tokens. Holding, folded, winner, offline, and sitting-out states use the approved minimal glyph language.
- A holding/folded/winner status glyph follows its physical seat and is never counter-rotated into a screen-upright or unexplained 90-degree card icon.
- Four equal corner targets are at least 52×52 CSS pixels. Upper panels and their text rotate 180 degrees for the upper seats.
- Panels remain flush to their chosen physical edges. Only real iPad page fullscreen may reserve the empirically observed Safari native-exit target; a browser simulation does not establish that native-corner geometry as a fact.
- Quick panel reference geometry is 650×244; utilities are 52×52 with 20-pixel separation; actions have an 18-pixel gap; Next Card is 190×102; Next Hand is 374×102.
- Slider track is 156×64 with a 64-pixel circular handle and 92-pixel travel. Track and handle share a 32-pixel radius. Three vertical grip bars remain contained inside the handle. Browser-native range UI is forbidden.
- The gold thread is a continuous four-pixel path around the approved fillet. It has no thin centre, detached segment, or stray vertical line.
- A successful Next Card or Next Hand action closes the panel.
- The centered secondary panel retains a coherent grid for Players & seats, Appearance, Displays & pairing, This device, Connection & recovery, and Diagnostics & history. Capability limits are stated without collapsing the panel into an awkward strip.
- On a host device in Tablet View, Players & seats opens the real player administration surface. This path is a release-blocking interaction test.
- Dark Green, Black Gold, and Deep Navy preserve identical geometry and synchronize to every table screen.
- System dark appearance cannot invert the selected palette or warm ivory cards; table appearance comes only from the synchronized table theme.
- Showdown preserves the quiet-mode community-board box. Revealed side hands move only along their own edge when needed, and the best-hand note sits directly below the unchanged board.

## Functional and recovery protocol

- Run create, 2/6/10-seat join, deal, private reveal/hide, fold/undo, Show, streets, explicit early end, next hand, sit-out/return, permanent leave, replacement, same-device host-player, and Table View.
- Every live client performs event-driven refresh plus visible-state/online/focus catch-up and a bounded visible polling safety net. iOS background execution is not claimed.
- Recovery checks cover refresh, bfcache, temporary suspension, route restart, stale link, credential rotation, revision conflict, and explicit reconnect.
- Every public artifact and test trace is searched for invitation tokens, credentials, unrevealed cards, deck order, and private diagnostics.

### Live Table-side relay deployment contract

Table-side Mode is not deployable merely because its static artifact and local relay fixture pass. When `TABLE_SIDE_CONNECTION_SERVICE_URL` is configured, `pnpm qa:live-relay` must run after the hosted artifact is configured and before its manifest is created or Pages is deployed. The gate verifies:

1. the configured WSS hostname resolves in public DNS;
2. `GET /health` returns HTTP 200 and `{ "status": "ok" }`;
3. the table-session CORS preflight permits the exact configured app origin, `POST`, `authorization`, and `content-type`;
4. a structurally valid request carrying an intentionally invalid operator token reaches the service and is rejected with HTTP 401 `access-denied`;
5. when `RELAY_OPERATOR_TOKEN_FILE` is supplied for an owner-side check, the owner-only file has restrictive permissions and its token receives a valid short-lived table ticket without either credential being printed.

The deployed `table-side/poker-config.js` must then be read back and checked against the same verified URL. A later Quick Tunnel failure remains an uptime incident; the UI must replace browser-native `Load failed`/`Failed to fetch` text with actionable relay guidance. Quick Tunnels remain temporary field infrastructure, not an uptime claim.

### Open-source relay isolation contract

`self_hosting_contract` in `qa-registry.yaml` makes operator portability independent of project memory. Its focused test and registry gate require:

1. a build with no `TABLE_SIDE_CONNECTION_SERVICE_URL` keeps `poker-config.js` empty and does not acquire a project-owner endpoint;
2. the fork-aware Pages workflow derives an ordinary GitHub Pages origin from `github.repository_owner`, accepts an explicit `TABLE_SIDE_APP_ORIGIN` for a custom domain, and runs the live relay gate only when that fork configured a relay;
3. the deployer kit builds the Connection Service from source, binds cleartext HTTP to loopback, mounts an operator-token file secret, and contains no Ruihe endpoint or credential;
4. `pnpm relay:create-token` creates a private non-overwriting token file without printing it;
5. `pnpm relay:doctor` verifies the public service contract without printing the operator token or table ticket; and
6. the self-hosting guide contains the complete server, TLS/tunnel, fork configuration, deployed read-back, recovery, and symptom-based troubleshooting path.

The operator token is never a GitHub variable or secret. Repository variables hold only the deployer's public relay URL and, for a custom app domain, its public HTTPS origin. A missing relay variable produces an intentionally unconfigured static build, not a hidden shared-service default.

## Accessibility and responsive protocol

- Run axe on Home, join, waiting/sit-out, Player, Host, Tablet quiet/quick/secondary, Public, and TV states.
- All controls have accessible names; icon-only controls have at least 44×44 targets (52×52 for Tablet utilities/corners).
- Slider supports pointer, touch-compatible pointer events, Home/End, arrows, Enter, and Space.
- At 200% text sizing and every registry viewport there is no hidden primary action, clipped label, card overlap, or horizontal document overflow.
- `prefers-reduced-motion` removes nonessential transitions without hiding state.

## Performance protocol

- `pnpm qa:performance` measures the total built Table-side JavaScript set (raw and per-file gzip totals), total Table-side CSS, and standalone Airplane HTML against explicit registry budgets. Splitting one bundle into several files therefore cannot bypass a ceiling. The budgets are regression ceilings, not claims of good real-network performance.
- Browser actions must reach their asserted result inside the registry interaction timeout in both Chromium and Mobile WebKit. Tests use the resulting state—not a click event—as the completion signal.
- Registered phone, tablet, desktop, and TV viewports are checked for horizontal overflow, clipped cards, and missing primary controls. Phone text is also checked at 200% root text size.
- Initial load, battery, camera throughput, long-session memory, and representative network latency remain physical/field measurements until dated evidence exists; the bundle-size gate cannot substitute for them.

## Release commands

```sh
pnpm install --frozen-lockfile
pnpm qa:registry
pnpm check
pnpm qa:browser
pnpm qa:performance
pnpm audit:prod
TABLE_SIDE_APP_ORIGIN=https://cai-ruihe.github.io TABLE_SIDE_CONNECTION_SERVICE_URL=wss://relay.example.test pnpm qa:live-relay
pnpm vitest run tests/contract/table-side-self-hosting.test.ts tests/contract/table-side-release-config.test.ts tests/contract/live-relay-release-gate.test.ts
pnpm release:reproducibility
pnpm release:manifest
pnpm release:verify
```

`pnpm qa:release` runs the local automated subset in the required order. CI repeats the locked install and release-blocking browser suite before Pages deployment. `pnpm qa:registry` also verifies that CI preserves browser failure evidence; removing that diagnostic step blocks the release gate.

For iOS Home Screen identity, the browser journey verifies that the selected
Apple touch icon source has an opaque corner and a versioned URL. The physical
matrix must still delete and re-add an existing shortcut before judging the
icon, because a device can retain a previous shortcut asset.

## Evidence and claim language

Every release record separates:

- **Fact:** directly witnessed by an attached automated, rendered, physical, or deployed receipt.
- **Inference:** a reasoned conclusion whose assumptions are named.
- **Unknown:** untested, unavailable, or outside the evidence boundary.

A green automated suite does not convert physical iOS, WAN, camera, China-network, or uptime Unknowns into Facts.
