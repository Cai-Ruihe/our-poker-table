# UI regression repair — 2026-09-14

## Cause and change

The preceding macOS browser run had seven Chromium visual-test failures
(16 mismatched screenshots) and one mobile WebKit layout failure. Reproducing
them against the earlier accounting source established that they predated the
Phase 2 accounting work; it did not justify leaving the browser gate failing.

The Darwin visual references predated the accepted presentation changes in
`e74a6dc`, `48aa3ce`, and `39d860d`. Linux references were refreshed in
`39d860d`, while the corresponding Darwin references were not. The differences
include the home language control moving into the brand bar, player-control
spacing, centered board geometry, corner controls, showdown-note placement,
and the physical-seat map. The owning requirements remain M06.

The master visually compared all 16 failed actual images with current Linux
references and inspected representative previous Darwin references, then
reviewed the four
additional captures refreshed by those same seven test cases. Twenty Darwin
references now represent the current layout. This refresh did not change any
functional assertions, geometry checks, screenshot tolerance, or skip rule.

Mobile WebKit exposed a separate real defect: the brand bar's `0.4rem` vertical
padding gave a measured 6.390625px top clearance when the language buttons
wrapped, below the existing 8px requirement. Changing it to `0.5rem` makes the
existing top/bottom-clearance and no-extra-row assertions pass. The shared rule
also changes the Linux home and join captures by approximately three pixels
in height/position; both Linux references were reviewed and refreshed from an
isolated Linux render, rather than copied from macOS.

## Verification

- The exact mobile WebKit failure passed after the CSS correction.
- All seven Chromium cases completed during scoped reference generation.
- A separate Linux Chromium run passed the home/join visual comparison and
  the bilingual host-creation geometry test: two tests, 16.5 seconds.
- Linux used the matching official Playwright 1.62.1 Noble image, Node 24,
  and locked dependencies in an isolated copy. Its first attempt exceeded
  the normal 30-second build-start timeout under emulation. The successful
  run used that same candidate's completed build and an explicitly reused
  local preview; the repository timeout was not increased.
- CSS formatting and `git diff --check` passed.
- The final macOS `pnpm qa:browser` run, with reference updating disabled,
  passed: 248 passed, 37 existing configured skips, zero failures in 11.3
  minutes. All eight previously failing cases passed. Desktop Chromium,
  mobile Chromium, and mobile WebKit were included. No skip was added.

Local diagnostic logs and preserved original failure images are under
`/tmp/poker-ui-failures-20260914/`. This repair changes neither accounting
authority nor card-projection boundaries. It does not establish complete
Phase 2 functionality, physical-device qualification, or deployment.

## MULTI_AGENT_DEV_V1

- Master: session `01a09b73-f564-7a23-b650-04f175f14891`, requested and effective
  `gpt-6-astra / medium`, attested by the host session's `turn_context`.
- Workers: UI-BASELINE → `01a09bb8-ecce-76a0-8bc1-6d38476e2c33`;
  UI-WEBKIT → `01a09bb9-6950-7b40-8356-6d7d79fdd862`. Both requested and
  effective `gpt-5.6-luna / max`, attested by host `session_meta` and
  `turn_context` records; both completed without writes or subdelegation.
- Delegated: independent snapshot-history/requirement diagnosis and the
  separate WebKit CSS diagnosis, bounded by a recorded HEAD/hash manifest.
- Kept with Astra: visual acceptance, source and reference edits, shared
  browser execution, cross-platform checks, integration, and final judgment.
- Evidence: recorded source manifest, Git history, all reviewed images,
  unchanged assertion/tolerance configuration, and the verification above.
- Conflicts resolved: stale references and the real spacing defect were
  handled separately. Linux references changed only where the spacing fix
  altered their rendered geometry.
- Efficiency: two parallel read-only lanes; one serialized writer. The
  emulated Linux build required a prebuild after its startup timeout. No
  reliable token-cost or comparative speedup measurement is available.
- Unknowns: full Linux CI and real physical devices have not been qualified
  by this bounded repair. No deployment was performed.
