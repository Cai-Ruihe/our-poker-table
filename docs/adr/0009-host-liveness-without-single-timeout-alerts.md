# ADR-0009: Host liveness without single-timeout alerts

- **Status:** Accepted
- **Date:** 2026-08-26
- **Decider:** Project Owner
- **Scope:** Phase 1 Table-side Mode; M04 Connectivity and Connection Service; M07 Persistence, Recovery, and History
- **Decision IDs:** `RECOVERY-HOST-LIVENESS`, `RECOVERY-FOREGROUND-AUTO`, `NET-ROUTE`, `AUTHORITY-PERSIST-BEFORE-ACK`

## Context

The current Table-side client treats one unanswered request as a Host failure.
This produces a misleading alert when the Host browser is temporarily unable to
run JavaScript even though the authenticated room/relay can later carry a deal.
The remedy must work for any number of players joining at any phase without a
central scheduler or an assumption about a fixed room size.

## Evidence

### Facts

- The current client issues a full projection request from its four-second
  foreground poll and fails a request after one 7.5-second timeout; see
  [`app.tsx`](../../apps/web/src/app.tsx) and
  [`runtime.ts`](../../apps/web/src/runtime.ts).
- Capability requests are serialized by the Host and currently persist recovery
  before their response; see [`runtime.ts`](../../apps/web/src/runtime.ts).
- A focused relay-only browser experiment kept the transport available while
  pausing the Host document: the Player displayed the no-response warning, then
  received a later flop after the Host resumed. A separate ten-player,
  relay-only unstalled experiment produced no timeout over the observed polling
  window.
- Google SRE documents randomized exponential backoff for retries to avoid
  synchronized retry cascades, but it is a retry tactic rather than a
  requirement for a global player scheduler. [Google SRE Book](https://sre.google/sre-book/addressing-cascading-failures/)

### Inferences

- A single delayed request is not sufficient evidence that the Host is
  unavailable.
- A local per-client liveness state machine gives useful, less noisy feedback
  without needing to know how many players exist or when they joined.
- Polling jitter should not be added speculatively: the current ten-player
  controlled run did not prove a burst problem.

### Unknowns

- The exact physical-device trigger for the observed delays is unmeasured:
  Host foreground scheduling, relay latency, and queued work remain candidates.
- The final liveness interval and per-attempt timeout need measurement on the
  actual iOS/iPadOS/Android device matrix.

## Decision

Table-side Mode uses an authenticated, lightweight, read-only Host liveness
exchange that is separate from projection catch-up.

- The first and second consecutive missed attempts are silent and retry.
- Only a third consecutive missed attempt, with no valid authenticated Host
  frame between the attempts, may show Host-unavailable guidance.
- Any valid authenticated Host frame immediately resets the counter and removes
  the guidance.
- Liveness traffic neither persists recovery state nor changes game, seat, or
  authority state.
- No custom player-count-aware or globally coordinated polling algorithm is
  introduced. If physical-device measurements later demonstrate a
  burst-induced queue, use the established per-client randomized
  backoff-with-jitter pattern; do not invent a room-membership scheduler.

This ADR records the acceptance criteria; it does not authorize the code change.

## Consequences

### Benefits

- A temporary Host pause cannot falsely tell the room that Wi-Fi or the table
  has failed after only one delayed response.
- New and existing players use the same local rule, regardless of table size or
  join timing.
- Liveness no longer creates avoidable recovery writes.

### Costs and risks

- A real failure is reported only after three misses, not the first one.
- A liveness exchange and its privacy-safe diagnostics still need implementation
  and physical-device verification.
- Jitter remains an evidence-gated future option, not a promised optimization.

## Alternatives considered

- **Alert after one timeout:** rejected because the focused relay experiment
  reproduced a false positive.
- **Central player scheduler / player-count-aware algorithm:** rejected for now;
  it adds membership and coordination complexity without current evidence that
  it solves the field issue.
- **Add jitter immediately:** deferred. It has established industry precedent,
  but current evidence does not show that synchronized polling is the cause.

## Security and privacy effect

The liveness exchange is authenticated and contains no cards, game commands,
or authority upgrade. It must be safe to record only as redacted timing and
route metadata. The Connection Service remains card-blind and cannot become
poker authority through liveness.

## Validation and revisit trigger

Before release, prove in automated direct, Cloudflare-relay, and Mac-relay
tests that two misses remain silent, the third is actionable, a later valid
Host event clears immediately, and liveness does not write recovery state.
Repeat on physical iPhone Player, iPad Host, Android Player, Tablet, and TV,
including Host background/foreground and two-, six-, and ten-player tables with
a new mid-hand join. Revisit this ADR only if those measurements show
burst-induced queueing or a material false-negative delay.
