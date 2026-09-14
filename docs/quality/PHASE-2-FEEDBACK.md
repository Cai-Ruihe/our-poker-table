# Phase 2 owner feedback — authorized repair

The owner initially requested collection only on 2026-09-14. Later the same day, the owner explicitly authorized fixing all five recorded items with multi-agent-dev and publishing to GitHub. The previous collection-only restriction is superseded for items 001–005. Implementation and publication verification are in progress; the historical observations below remain unchanged.

## P2-POT-POSITION-001 — Pot directly below the community cards

- Status: Repair authorized; implementation and verification in progress.
- Owner request: “the pot should be just below the card at the middle of the table”.
- Observed evidence: The supplied screenshot shows “Pot 8” in a status strip near the top of the table, while the community-card row is lower down with a large gap between them.
- Requested result: Place the pot amount directly below the community-card row, horizontally centered on the table.
- Scope: Phase 2 multiplayer table layout. This feedback does not request relocating the current-bet or next-player indicators.
- Evidence reference: Owner screenshot `codex-clipboard-8666fac1-2a55-428f-81a4-e1b370854ec8.png`, supplied in this conversation on 2026-09-14. No private table-resume URL is recorded.
- Historical collection state: No changes were made before repair authorization.

## P2-ACTING-SEAT-002 — Make the acting seat visually obvious

- Status: Repair authorized; implementation and verification in progress.
- Owner feedback: The current acting-player text is good, but the table UI needs a more obvious indication of the acting seat; lighting up the seat is a suggested option.
- Observed evidence: The supplied screenshot crop shows the text “Android to act”. The crop does not establish how the full seat is currently rendered.
- Requested result: Retain the acting-player text and prominently distinguish the corresponding seat directly on the table so players can immediately see whose turn it is.
- Design direction, not a finalized effect: Seat highlighting or a glow. Exact styling and animation remain undecided; the owner has not required a particular effect.
- Evidence reference: Owner screenshot `codex-clipboard-7f55d8f5-3329-440c-92d1-9da4395478bd.png`, supplied in this conversation on 2026-09-14.
- Historical collection state: Collection only, before the subsequent repair authorization.

## P2-SEAT-CHIP-COUNTS-003 — Show each seat's remaining chips in both views

- Status: Repair authorized; implementation and verification in progress.
- Owner request: “show the amont of chips in head for each seat in the table ui as well as the player ui”.
- Recorded interpretation: “chips in head” means chips in hand: each seat's current remaining stack, distinct from chips already committed to the pot. This interpretation has been stated to the owner; no exact placement or visual treatment is prescribed.
- Requested result: Display every occupied seat's remaining chip count in both the table UI and the player UI, clearly associated with the relevant seat/player and kept current as play progresses.
- Evidence: Owner text feedback supplied in this conversation on 2026-09-14. No code inspection or new screenshot was used to assert the current implementation's behavior.
- Historical collection state: Collection only, before the subsequent repair authorization.

## P2-PLAYER-TOP-UP-004 — Add player chip top-ups to table controls

- Status: Repair authorized; implementation and verification in progress.
- Owner request: “the table control should have a way to top up chips for player”.
- Requested result: Provide a control in the table management UI to select a player and add play chips to that player's stack.
- Scope: Record the requested capability only. Exact interaction, amount entry, eligibility/timing, and confirmation behavior are not specified by this feedback; reconcile them with the existing Phase 2 rules before any later implementation. This entry does not authorize changing those rules.
- Evidence: Owner text feedback supplied in this conversation on 2026-09-14.
- Historical collection state: Collection only, before the subsequent repair authorization.

## P2-END-HAND-REJECTION-005 — Invalid end-hand action and misleading reconnect prompt

- Status: Repair authorized following read-only diagnosis; implementation and verification in progress.
- Owner report: The open multiplayer page shows “End hand rejected: command-not-allowed” alongside “Reconnect to table”; the owner asks why.
- Screenshot evidence: `codex-clipboard-520a3330-3fd2-4625-ad2c-e428b6b87a7d.png`, supplied on 2026-09-14. The crop shows the rejection and reconnect button, not the preceding user action or full hand state.
- Verified source facts: `HostTableRuntime.endHand()` emits this message when the `EndHand` command is rejected. Game Core explicitly rejects `EndHand` for digital-accounting profiles; completion instead uses settlement confirmation. `TabletControls.commitNextHand()` calls `onEndHand` before starting another hand when the current hand is not complete, without checking the accounting profile. Its availability check only tests busy state and callback presence. The shared error banner displays a reconnect button for any error when a reconnect callback exists.
- Inference: The tablet/table next-hand control is a concrete route to this rejection during a digital hand. The owner's exact triggering action remains unverified; no interaction with the live table or reproduction was performed.
- Recorded problem for later repair: Table controls must respect digital-hand settlement rules and preview capabilities, and action-rule rejections should receive meaningful guidance rather than implying a network problem. This error alone is not evidence of a disconnection or lost chips.
- Historical collection state: Read-only diagnosis before subsequent repair authorization.

## Integrated repair and verification

- 001: The pot is attached directly below the card rail, centered with a 12px
  gap in quiet table modes. Desktop/mobile geometry assertions verify it.
- 002: Acting seats receive a visible gold outline/glow, a text cue, and an
  accessible name. The highlight clears when betting ends.
- 003: Every occupied seat uses its authoritative remaining stack, including
  actual zero; unavailable values render a dash. Player screens also show a
  named stack list.
- 004: Host player administration provides selection, positive whole amount,
  review, and confirmation. The ledger operation is persisted atomically and
  duplicate command receipts survive recovery. It is disabled during play.
- 005: Digital Tablet controls prepare/confirm settlement; they cannot manually
  end a digital hand or reveal a street. Next-hand is unavailable until confirmed
  settlement and at least two eligible funded seats. Rule rejections do not
  suggest reconnecting.

Integration review also caught fixed-roster dealer rotation and stale join-window
recovery. Digital next hands now rotate the dealer; manual relocation remains a
physical-chip control. Digital recovery closes ordinary invitations before new
identity seats can be redeemed. The packaged journey restores an old encrypted
runtime record against a committed hand to exercise this exact crash boundary.

The original Phase 1 archive remains pinned. GitHub and live consumer results
will be recorded in the [preview release record](../releases/PHASE-2-PREVIEW.md).
