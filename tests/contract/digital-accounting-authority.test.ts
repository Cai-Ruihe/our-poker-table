import { describe, expect, test } from "vitest";

import { createCardCustody, type Card } from "@html-poker/card-custody";
import {
  createTrustedHostAuthority,
  type CommandEnvelope,
  type PersistedAuthorityState,
} from "@html-poker/game-core";
import { createMemoryTableStore } from "@html-poker/persistence";

const orderedDeck = ["c", "d", "h", "s"].flatMap((suit) =>
  ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"].map(
    (rank) => `${rank}${suit}` as Card,
  ),
);

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
    actor: options.actor ?? { actorId: "host", kind: "trusted-host" },
    authorityEpoch: "epoch-1",
    commandId,
    expectedRevision,
    ...(options.handId ? { handId: options.handId } : {}),
    payload,
    tableId: "table-1",
  };
}

describe("Digital Chips Profile through the Trusted Host interface", () => {
  test("deals and advances only from committed digital betting actions", async () => {
    const authority = createTrustedHostAuthority({
      authorityEpoch: "epoch-1",
      custody: createCardCustody({ shuffler: () => orderedDeck }),
      handIdFactory: () => "hand-1",
      store: createMemoryTableStore(),
      tableId: "table-1",
    });

    await expect(
      authority.submit(
        command("create", 0, {
          dealerSeatId: "alice",
          rulesProfile: {
            bigBlind: 2,
            housePolicyId: "p2-house-1",
            id: "nlhe-home-v1",
            smallBlind: 1,
            startingStack: 100,
          },
          seats: [
            { displayName: "Alice", seatId: "alice" },
            { displayName: "Bob", seatId: "bob" },
          ],
          type: "CreateTable",
        }),
      ),
    ).resolves.toMatchObject({
      events: [{ type: "TableCreated" }, { type: "AccountingSessionCreated" }],
      revision: 1,
      status: "accepted",
    });
    await expect(
      authority.submit(command("start", 1, { type: "StartHand" })),
    ).resolves.toMatchObject({ revision: 2, status: "accepted" });

    const forbiddenLegacyCommands: readonly {
      readonly actor?: CommandEnvelope["actor"];
      readonly handScoped?: boolean;
      readonly payload: CommandEnvelope["payload"];
    }[] = [
      { handScoped: true, payload: { street: "flop", type: "RevealStreet" } },
      {
        actor: { kind: "seat", seatId: "alice" },
        handScoped: true,
        payload: { type: "FoldCards" },
      },
      {
        actor: { kind: "seat", seatId: "alice" },
        handScoped: true,
        payload: { type: "ShowCards" },
      },
      {
        actor: { kind: "seat", seatId: "alice" },
        handScoped: true,
        payload: { type: "MuckCards" },
      },
      { handScoped: true, payload: { type: "EndHand" } },
      {
        handScoped: true,
        payload: { reason: "legacy void", type: "VoidHand" },
      },
      {
        payload: {
          seat: { displayName: "Charlie", seatId: "charlie" },
          type: "RegisterSeat",
        },
      },
    ];
    for (const [index, entry] of forbiddenLegacyCommands.entries()) {
      await expect(
        authority.submit(
          command(`forbidden-${index}`, 2, entry.payload, {
            ...(entry.actor ? { actor: entry.actor } : {}),
            ...(entry.handScoped ? { handId: "hand-1" } : {}),
          }),
        ),
      ).resolves.toEqual({
        code: "command-not-allowed",
        revision: 2,
        status: "rejected",
      });
    }

    expect(authority.project({ kind: "public" })).toMatchObject({
      accounting: {
        currentActorSeatId: "alice",
        currentBet: 2,
        potTotal: 3,
        seats: [
          { seatId: "alice", stack: 99, streetContribution: 1 },
          { seatId: "bob", stack: 98, streetContribution: 2 },
        ],
        street: "preflop",
      },
      board: [],
      phase: "preflop",
      rulesProfileId: "nlhe-home-v1",
    });
    expect(authority.project({ kind: "seat", seatId: "alice" })).toMatchObject({
      self: {
        legalActions: [
          { type: "fold" },
          { amount: 1, type: "call" },
          { maxTo: 100, minTo: 4, type: "raise-to" },
          { to: 100, type: "all-in" },
        ],
      },
    });
    expect(authority.project({ kind: "seat", seatId: "bob" })).toMatchObject({
      self: { legalActions: [] },
    });

    await expect(
      authority.submit(
        command(
          "call",
          2,
          { action: { type: "call" }, type: "SubmitBettingAction" },
          { actor: { kind: "seat", seatId: "alice" }, handId: "hand-1" },
        ),
      ),
    ).resolves.toMatchObject({ revision: 3, status: "accepted" });
    await expect(
      authority.submit(
        command(
          "check",
          3,
          { action: { type: "check" }, type: "SubmitBettingAction" },
          { actor: { kind: "seat", seatId: "bob" }, handId: "hand-1" },
        ),
      ),
    ).resolves.toMatchObject({ revision: 4, status: "accepted" });

    expect(authority.project({ kind: "public" })).toMatchObject({
      accounting: {
        currentActorSeatId: "bob",
        currentBet: 0,
        potTotal: 4,
        street: "flop",
      },
      board: ["7c", "8c", "9c"],
      phase: "flop",
    });
  });

  test("proposes a tie without moving balances and commits it only after host confirmation", async () => {
    let nextHand = 0;
    const authority = createTrustedHostAuthority({
      authorityEpoch: "epoch-1",
      custody: createCardCustody({ shuffler: () => orderedDeck }),
      handIdFactory: () => `hand-${++nextHand}`,
      store: createMemoryTableStore(),
      tableId: "table-1",
    });
    await authority.submit(
      command("create", 0, {
        dealerSeatId: "alice",
        rulesProfile: {
          bigBlind: 2,
          housePolicyId: "p2-house-1",
          id: "nlhe-home-v1",
          smallBlind: 1,
          startingStack: 100,
        },
        seats: [
          { displayName: "Alice", seatId: "alice" },
          { displayName: "Bob", seatId: "bob" },
        ],
        type: "CreateTable",
      }),
    );
    await authority.submit(command("start", 1, { type: "StartHand" }));
    const actions: readonly {
      readonly seatId: string;
      readonly type: "call" | "check";
    }[] = [
      { seatId: "alice", type: "call" },
      { seatId: "bob", type: "check" },
      { seatId: "bob", type: "check" },
      { seatId: "alice", type: "check" },
      { seatId: "bob", type: "check" },
      { seatId: "alice", type: "check" },
      { seatId: "bob", type: "check" },
      { seatId: "alice", type: "check" },
    ];
    let revision = 2;
    for (const action of actions) {
      const receipt = await authority.submit(
        command(
          `action-${revision}`,
          revision,
          {
            action: { type: action.type },
            type: "SubmitBettingAction",
          },
          {
            actor: { kind: "seat", seatId: action.seatId },
            handId: "hand-1",
          },
        ),
      );
      expect(receipt.status).toBe("accepted");
      revision += 1;
    }
    expect(authority.project({ kind: "public" })).toMatchObject({
      accounting: { phase: "showdown", potTotal: 4 },
      board: ["7c", "8c", "9c", "Jc", "Kc"],
      phase: "showdown",
      revision: 10,
    });

    await expect(
      authority.submit(
        command(
          "prepare-settlement",
          10,
          { type: "PrepareSettlement" },
          { handId: "hand-1" },
        ),
      ),
    ).resolves.toMatchObject({
      events: [{ type: "SettlementProposed" }],
      revision: 11,
      status: "accepted",
    });
    const pending = authority.project({ kind: "public" });
    expect(pending).toMatchObject({
      accounting: {
        phase: "settlement-pending",
        potTotal: 4,
        seats: [
          { seatId: "alice", stack: 98 },
          { seatId: "bob", stack: 98 },
        ],
        settlement: {
          pots: [
            {
              amount: 4,
              awards: [
                { amount: 2, seatId: "bob" },
                { amount: 2, seatId: "alice" },
              ],
              winnerSeatIds: ["bob", "alice"],
            },
          ],
        },
      },
      phase: "settlement-pending",
    });

    await expect(
      authority.submit(
        command(
          "confirm-settlement",
          11,
          { type: "ConfirmSettlement" },
          { handId: "hand-1" },
        ),
      ),
    ).resolves.toMatchObject({
      events: [{ type: "SettlementConfirmed" }],
      revision: 12,
      status: "accepted",
    });
    expect(authority.project({ kind: "public" })).toMatchObject({
      accounting: {
        phase: "complete",
        potTotal: 0,
        seats: [
          { seatId: "alice", stack: 100 },
          { seatId: "bob", stack: 100 },
        ],
      },
      phase: "complete",
    });
    await expect(
      authority.submit(command("second-hand", 12, { type: "StartHand" })),
    ).resolves.toMatchObject({
      events: [
        { type: "HandStarted" },
        { type: "AccountingHandStarted" },
        { type: "ForcedBetPosted" },
        { type: "ForcedBetPosted" },
      ],
      handId: "hand-2",
      revision: 13,
      status: "accepted",
    });
  });

  test("fails recovery closed when persisted accounting violates conservation", async () => {
    const store = createMemoryTableStore<PersistedAuthorityState>();
    const authority = createTrustedHostAuthority({
      authorityEpoch: "epoch-1",
      custody: createCardCustody({ shuffler: () => orderedDeck }),
      handIdFactory: () => "hand-1",
      store,
      tableId: "table-1",
    });
    await authority.submit(
      command("create", 0, {
        dealerSeatId: "alice",
        rulesProfile: {
          bigBlind: 2,
          housePolicyId: "p2-house-1",
          id: "nlhe-home-v1",
          smallBlind: 1,
          startingStack: 100,
        },
        seats: [
          { displayName: "Alice", seatId: "alice" },
          { displayName: "Bob", seatId: "bob" },
        ],
        type: "CreateTable",
      }),
    );
    const saved = await store.load();
    expect(saved).toBeDefined();
    if (!saved?.state.accounting) throw new Error("Accounting state missing.");
    await store.commit(saved.revision, {
      revision: saved.revision + 1,
      state: {
        ...saved.state,
        accounting: {
          ...saved.state.accounting,
          seats: saved.state.accounting.seats.map((seat, index) =>
            index === 0 ? { ...seat, stack: seat.stack + 1 } : seat,
          ),
        },
        revision: saved.state.revision + 1,
      },
    });

    const recovered = createTrustedHostAuthority({
      authorityEpoch: "epoch-1",
      custody: createCardCustody({ shuffler: () => orderedDeck }),
      handIdFactory: () => "hand-2",
      store,
      tableId: "table-1",
    });
    await expect(recovered.recover()).resolves.toEqual({
      code: "corrupt-state",
      status: "rejected",
    });
  });
});
