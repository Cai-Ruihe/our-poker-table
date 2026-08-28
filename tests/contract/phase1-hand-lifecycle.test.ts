import { describe, expect, it } from "vitest";

import { createCardCustody, type Card } from "@html-poker/card-custody";
import {
  createTrustedHostAuthority,
  type CommandEnvelope,
  type TrustedHostAuthority,
} from "@html-poker/game-core";
import { createMemoryTableStore } from "@html-poker/persistence";

const orderedDeck = ["c", "d", "h", "s"].flatMap((suit) =>
  ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"].map(
    (rank) => `${rank}${suit}` as Card,
  ),
);

function createAuthority(): TrustedHostAuthority {
  return createTrustedHostAuthority({
    authorityEpoch: "epoch-1",
    custody: createCardCustody({ shuffler: () => orderedDeck }),
    handIdFactory: () => "hand-1",
    store: createMemoryTableStore(),
    tableId: "table-1",
  });
}

function command(
  commandId: string,
  expectedRevision: number,
  payload: CommandEnvelope["payload"],
  options: {
    readonly actor?: CommandEnvelope["actor"];
    readonly handId?: string;
  } = {},
): CommandEnvelope {
  return {
    actor: options.actor ?? { actorId: "host-1", kind: "trusted-host" },
    authorityEpoch: "epoch-1",
    commandId,
    expectedRevision,
    ...(options.handId ? { handId: options.handId } : {}),
    payload,
    tableId: "table-1",
  };
}

async function createAndStart(authority: TrustedHostAuthority): Promise<void> {
  await authority.submit(
    command("create", 0, {
      dealerSeatId: "seat-a",
      seats: [
        { displayName: "Alice", seatId: "seat-a" },
        { displayName: "Bob", seatId: "seat-b" },
      ],
      type: "CreateTable",
    }),
  );
  await authority.submit(command("start", 1, { type: "StartHand" }));
}

describe("complete Phase 1 hand lifecycle", () => {
  it("lets a seat retract a provisional fold until dependent progression finalizes it", async () => {
    const authority = createAuthority();
    await createAndStart(authority);

    await expect(
      authority.submit(
        command(
          "fold-a",
          2,
          { type: "FoldCards" },
          { actor: { kind: "seat", seatId: "seat-a" }, handId: "hand-1" },
        ),
      ),
    ).resolves.toMatchObject({
      events: [{ type: "FoldStarted" }],
      revision: 3,
      status: "accepted",
    });
    expect(authority.project({ kind: "public" }).seats).toContainEqual(
      expect.objectContaining({
        seatId: "seat-a",
        status: "folded-provisional",
      }),
    );

    await expect(
      authority.submit(
        command(
          "undo-a",
          3,
          { type: "RetractFold" },
          { actor: { kind: "seat", seatId: "seat-a" }, handId: "hand-1" },
        ),
      ),
    ).resolves.toMatchObject({ events: [{ type: "FoldRetracted" }] });

    await authority.submit(
      command(
        "fold-again",
        4,
        { type: "FoldCards" },
        { actor: { kind: "seat", seatId: "seat-a" }, handId: "hand-1" },
      ),
    );
    await expect(
      authority.submit(
        command(
          "flop",
          5,
          { street: "flop", type: "RevealStreet" },
          { handId: "hand-1" },
        ),
      ),
    ).resolves.toMatchObject({
      events: [{ type: "FoldFinalized" }, { type: "StreetRevealed" }],
      status: "accepted",
    });
    expect(authority.project({ kind: "public" }).seats).toContainEqual(
      expect.objectContaining({ seatId: "seat-a", status: "folded" }),
    );
    await expect(
      authority.submit(
        command(
          "late-undo",
          6,
          { type: "RetractFold" },
          { actor: { kind: "seat", seatId: "seat-a" }, handId: "hand-1" },
        ),
      ),
    ).resolves.toMatchObject({
      code: "command-not-allowed",
      status: "rejected",
    });
  });

  it("keeps legacy muck events private during recovery replay", async () => {
    const authority = createAuthority();
    await createAndStart(authority);

    await authority.submit(
      command(
        "flop",
        2,
        { street: "flop", type: "RevealStreet" },
        { handId: "hand-1" },
      ),
    );
    await authority.submit(
      command(
        "turn",
        3,
        { street: "turn", type: "RevealStreet" },
        { handId: "hand-1" },
      ),
    );
    await authority.submit(
      command(
        "river",
        4,
        { street: "river", type: "RevealStreet" },
        { handId: "hand-1" },
      ),
    );
    await authority.submit(
      command(
        "show-a",
        5,
        { type: "ShowCards" },
        { actor: { kind: "seat", seatId: "seat-a" }, handId: "hand-1" },
      ),
    );
    await authority.submit(
      command(
        "muck-b",
        6,
        { type: "MuckCards" },
        { actor: { kind: "seat", seatId: "seat-b" }, handId: "hand-1" },
      ),
    );

    const publicProjection = authority.project({ kind: "public" });
    expect(publicProjection.showdown).toMatchObject({
      evaluatedSeatIds: ["seat-a"],
      leaders: ["seat-a"],
      status: "complete",
    });
    expect(publicProjection.seats).toContainEqual(
      expect.objectContaining({
        evaluation: expect.objectContaining({ category: "flush" }),
        holeCards: ["2c", "4c"],
        seatId: "seat-a",
        status: "shown",
      }),
    );
    expect(publicProjection.seats).toContainEqual(
      expect.objectContaining({ seatId: "seat-b", status: "mucked" }),
    );
    expect(JSON.stringify(publicProjection)).not.toContain("3c");
    expect(JSON.stringify(publicProjection)).not.toContain("5c");
  });

  it("keeps an append-only event history with stable event IDs", async () => {
    const authority = createAuthority();
    await createAndStart(authority);

    const history = authority.history();
    expect(history.map((event) => event.type)).toEqual([
      "TableCreated",
      "HandStarted",
    ]);
    expect(history.map((event) => event.revision)).toEqual([1, 2]);
    expect(new Set(history.map((event) => event.eventId)).size).toBe(2);
    expect(() => {
      (history as unknown as { type: string }[])[0] = { type: "tampered" };
    }).not.toThrow();
    expect(authority.history()[0]?.type).toBe("TableCreated");
  });

  it("relocates the logical dealer only between hands without dealing", async () => {
    const authority = createAuthority();
    await createAndStart(authority);

    await expect(
      authority.submit(
        command("mid-hand-relocation", 2, {
          dealerSeatId: "seat-b",
          type: "RelocateDealer",
        }),
      ),
    ).resolves.toMatchObject({
      code: "command-not-allowed",
      status: "rejected",
    });
    await authority.submit(
      command("end", 2, { type: "EndHand" }, { handId: "hand-1" }),
    );
    await expect(
      authority.submit(
        command("relocate", 3, {
          dealerSeatId: "seat-b",
          type: "RelocateDealer",
        }),
      ),
    ).resolves.toMatchObject({
      events: [{ type: "DealerRelocated" }],
      revision: 4,
      status: "accepted",
    });
    expect(authority.project({ kind: "public" })).toMatchObject({
      board: [],
      dealerSeatId: "seat-b",
      phase: "complete",
    });
  });

  it("records a reasoned void and correction without erasing prior events", async () => {
    const authority = createAuthority();
    await createAndStart(authority);
    const handStarted = authority
      .history()
      .find((event) => event.type === "HandStarted");
    if (!handStarted) throw new Error("Expected the hand-start event.");

    await expect(
      authority.submit(
        command(
          "void",
          2,
          {
            reason: "A card was exposed during the physical deal.",
            type: "VoidHand",
          },
          { handId: "hand-1" },
        ),
      ),
    ).resolves.toMatchObject({
      events: [{ type: "HandVoided" }],
      status: "accepted",
    });
    await expect(
      authority.submit(
        command("correction", 3, {
          correctedEventIds: [handStarted.eventId],
          reason: "Void recorded after the exposed-card report.",
          type: "RecordCorrection",
        }),
      ),
    ).resolves.toMatchObject({
      events: [{ type: "CorrectionRecorded" }],
      status: "accepted",
    });

    const history = authority.history();
    expect(history.map((event) => event.type)).toEqual([
      "TableCreated",
      "HandStarted",
      "HandVoided",
      "CorrectionRecorded",
    ]);
    expect(history.at(-1)).toMatchObject({
      correctedEventIds: [handStarted.eventId],
      reason: "Void recorded after the exposed-card report.",
    });
  });

  it("queues a mid-hand seat and applies future sit-out only to the next deal", async () => {
    const authority = createAuthority();
    await createAndStart(authority);

    await expect(
      authority.submit(
        command("join-c", 2, {
          seat: { displayName: "Carol", seatId: "seat-c" },
          type: "RegisterSeat",
        }),
      ),
    ).resolves.toMatchObject({ events: [{ type: "SeatRegistered" }] });
    expect(authority.project({ kind: "public" }).seats).toContainEqual(
      expect.objectContaining({ seatId: "seat-c", status: "waiting" }),
    );
    expect(() => authority.project({ kind: "seat", seatId: "seat-c" })).toThrow(
      "not active in this hand",
    );

    await authority.submit(
      command("sit-out-b", 3, {
        seatId: "seat-b",
        sittingOut: true,
        type: "SetSeatParticipation",
      }),
    );
    expect(authority.project({ kind: "public" }).seats).toContainEqual(
      expect.objectContaining({ seatId: "seat-b", status: "active" }),
    );
    await authority.submit(
      command("end", 4, { type: "EndHand" }, { handId: "hand-1" }),
    );
    await authority.submit(command("next", 5, { type: "StartHand" }));

    const nextHand = authority.project({ kind: "public" });
    expect(nextHand.seats).toContainEqual(
      expect.objectContaining({ seatId: "seat-b", status: "sitting-out" }),
    );
    expect(nextHand.seats).toContainEqual(
      expect.objectContaining({ seatId: "seat-c", status: "active" }),
    );
    expect(() => authority.project({ kind: "seat", seatId: "seat-b" })).toThrow(
      "not active in this hand",
    );
    expect(authority.project({ kind: "seat", seatId: "seat-c" })).toMatchObject(
      { self: { seatId: "seat-c" } },
    );
  });

  it("releases a departed physical-chip seat only between hands so its position can be reused", async () => {
    const authority = createAuthority();
    await createAndStart(authority);

    await authority.submit(
      command(
        "end-before-release",
        2,
        { type: "EndHand" },
        { handId: "hand-1" },
      ),
    );
    await expect(
      authority.submit(
        command("release-seat-b", 3, {
          seatId: "seat-b",
          type: "UnregisterSeat",
        }),
      ),
    ).resolves.toMatchObject({
      events: [{ type: "SeatUnregistered" }],
      status: "accepted",
    });
    expect(authority.project({ kind: "public" }).seats).toEqual([
      expect.objectContaining({ seatId: "seat-a" }),
    ]);

    await expect(
      authority.submit(
        command("join-new-seat-b", 4, {
          seat: { displayName: "Faye", seatId: "seat-new-b" },
          type: "RegisterSeat",
        }),
      ),
    ).resolves.toMatchObject({ events: [{ type: "SeatRegistered" }] });
    expect(authority.project({ kind: "public" }).seats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ seatId: "seat-a" }),
        expect.objectContaining({ seatId: "seat-new-b" }),
      ]),
    );
  });

  it("moves the dealer button to an eligible seat before a sitting-out dealer is dealt", async () => {
    const authority = createAuthority();
    await authority.submit(
      command("create-three-seat", 0, {
        dealerSeatId: "seat-a",
        seats: [
          { displayName: "Alice", seatId: "seat-a" },
          { displayName: "Bob", seatId: "seat-b" },
          { displayName: "Carol", seatId: "seat-c" },
        ],
        type: "CreateTable",
      }),
    );
    await authority.submit(command("start-first", 1, { type: "StartHand" }));
    await authority.submit(
      command("end-first", 2, { type: "EndHand" }, { handId: "hand-1" }),
    );
    await authority.submit(
      command("sit-out-dealer", 3, {
        seatId: "seat-a",
        sittingOut: true,
        type: "SetSeatParticipation",
      }),
    );

    await expect(
      authority.submit(
        command("start-without-dealer", 4, { type: "StartHand" }),
      ),
    ).resolves.toMatchObject({ status: "accepted" });

    const projection = authority.project({ kind: "public" });
    expect(projection.dealerSeatId).toBe("seat-b");
    expect(projection.seats).toContainEqual(
      expect.objectContaining({ seatId: "seat-a", status: "sitting-out" }),
    );
    expect(projection.seats).toContainEqual(
      expect.objectContaining({ seatId: "seat-b", status: "active" }),
    );
  });
});
