# Phase 1 next-version backlog

This backlog records owner-approved Phase 1 work that is deliberately **not**
implemented, tested as complete, or published in the current release. The
owning module PRD is authoritative; this index prevents deferred work from
being lost between field feedback and a future implementation cycle.

| ID | Scope | Owner | Current disposition | Acceptance owner |
| --- | --- | --- | --- | --- |
| [`RECONNECT-STORM-CONTROL-001`](../../quality/FIELD-FEEDBACK-LEDGER.md) / [`RECOVERY-RECONNECT-STORM-CONTROL`](../reference/DECISION-REGISTER.md#joining-identity-and-recovery) | Table-side reconnect cost, bounded recovery, ticket/DataChannel reuse, fan-out control, diagnostics, and weak-network/multi-client stress coverage | [M04 — Connectivity and Connection Service](../modules/M04-CONNECTIVITY-SERVICE.md#next-table-side-release-backlog--not-implemented-in-the-current-release) | Next Table-side version only; no current-code change, release claim, or Airplane Mode change | M04 automated recovery/stress suite and physical-device network gate |
