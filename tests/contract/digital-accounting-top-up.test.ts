import { describe, expect, test } from "vitest";

import { createDigitalAccounting } from "@html-poker/accounting";
import { createCardCustody, type Card } from "@html-poker/card-custody";
import {
  createTrustedHostAuthority,
  type CommandEnvelope,
  type PersistedAuthorityState,
} from "@html-poker/game-core";
import {
  createMemoryTableStore,
  type AtomicTableStore,
} from "@html-poker/persistence";

const orderedDeck = ["c", "d", "h", "s"].flatMap((suit) =>
  ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"].map(
    (rank) => `${rank}${suit}` as Card,
  ),
);

function deckWithAssignments(
  assignments: Readonly<Record<number, Card>>,
): readonly Card[] {
  const slots: (Card | undefined)[] = Array.from({ length: 52 });
  for (const [position, card] of Object.entries(assignments)) {
    slots[Number(position)] = card;
  }
  const used = new Set(
    slots.filter((card): card is Card => card !== undefined),
  );
  const remaining = orderedDeck.filter((card) => !used.has(card));
  return slots.map((card) => {
    if (card) return card;
    const next = remaining.shift();
    if (!next) throw new Error("deck fixture ran out of cards");
    return next;
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
    actor: options.actor ?? { actorId: "host", kind: "trusted-host" },
    authorityEpoch: "epoch-1",
    commandId,
    expectedRevision,
    ...(options.handId ? { handId: options.handId } : {}),
    payload,
    tableId: "table-1",
  };
}

function createAuthority(
  store: AtomicTableStore<PersistedAuthorityState> = createMemoryTableStore<PersistedAuthorityState>(),
  deck: readonly Card[] = orderedDeck,
) {
  let nextHand = 0;
  let shuffleCount = 0;
  const authority = createTrustedHostAuthority({
    authorityEpoch: "epoch-1",
    custody: createCardCustody({
      shuffler: () => {
        shuffleCount += 1;
        return deck;
      },
    }),
    handIdFactory: () => `hand-${++nextHand}`,
    store,
    tableId: "table-1",
  });
  return { authority, store, shuffleCount: () => shuffleCount };
}

async function createDigitalTable(
  authority: ReturnType<typeof createAuthority>["authority"],
) {
  return authority.submit(
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
}

async function settleHeadsUpHand(
  authority: ReturnType<typeof createAuthority>["authority"],
): Promise<number> {
  await expect(
    authority.submit(command("start-hand-1", 1, { type: "StartHand" })),
  ).resolves.toMatchObject({ revision: 2, status: "accepted" });

  await expect(
    authority.submit(
      command("top-up-during-hand", 2, {
        amount: 10,
        seatId: "alice",
        type: "TopUpChips",
      }),
    ),
  ).resolves.toMatchObject({
    code: "command-not-allowed",
    revision: 2,
    status: "rejected",
  });

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
  for (const [index, action] of actions.entries()) {
    const receipt = await authority.submit(
      command(
        `hand-1-action-${index + 1}`,
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
    expect(receipt).toMatchObject({
      revision: revision + 1,
      status: "accepted",
    });
    revision += 1;
  }

  const prepared = await authority.submit(
    command(
      "prepare-hand-1-settlement",
      revision,
      { type: "PrepareSettlement" },
      { handId: "hand-1" },
    ),
  );
  expect(prepared).toMatchObject({
    revision: revision + 1,
    status: "accepted",
  });
  revision += 1;
  await expect(
    authority.submit(
      command("top-up-during-settlement", revision, {
        amount: 10,
        seatId: "alice",
        type: "TopUpChips",
      }),
    ),
  ).resolves.toMatchObject({
    code: "command-not-allowed",
    revision,
    status: "rejected",
  });
  await expect(
    authority.submit(
      command(
        "confirm-hand-1-settlement",
        revision,
        { type: "ConfirmSettlement" },
        { handId: "hand-1" },
      ),
    ),
  ).resolves.toMatchObject({
    events: [{ type: "SettlementConfirmed" }],
    revision: revision + 1,
    status: "accepted",
  });
  return revision + 1;
}

async function createBustedThreeSeatTable() {
  const deck = deckWithAssignments({
    0: "Qc",
    1: "Ac",
    2: "7d",
    3: "Jc",
    4: "Ad",
    5: "9d",
    7: "2c",
    8: "4d",
    9: "6h",
    11: "8s",
    13: "Tc",
  });
  const { authority } = createAuthority(
    createMemoryTableStore<PersistedAuthorityState>(),
    deck,
  );
  await expect(
    authority.submit(
      command("create-three-seats", 0, {
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
          { displayName: "Charlie", seatId: "charlie" },
        ],
        type: "CreateTable",
      }),
    ),
  ).resolves.toMatchObject({ revision: 1, status: "accepted" });
  await expect(
    authority.submit(
      command("top-up-bob", 1, {
        amount: 100,
        seatId: "bob",
        type: "TopUpChips",
      }),
    ),
  ).resolves.toMatchObject({ revision: 2, status: "accepted" });
  await expect(
    authority.submit(
      command("top-up-charlie", 2, {
        amount: 100,
        seatId: "charlie",
        type: "TopUpChips",
      }),
    ),
  ).resolves.toMatchObject({ revision: 3, status: "accepted" });
  await expect(
    authority.submit(
      command("start-three-seat-hand", 3, { type: "StartHand" }),
    ),
  ).resolves.toMatchObject({ revision: 4, status: "accepted" });

  const actions: readonly {
    readonly actorSeatId: string;
    readonly action: "all-in" | "call" | "fold";
  }[] = [
    { actorSeatId: "alice", action: "all-in" },
    { actorSeatId: "bob", action: "call" },
    { actorSeatId: "charlie", action: "fold" },
  ];
  let revision = 4;
  for (const [index, entry] of actions.entries()) {
    await expect(
      authority.submit(
        command(
          `three-seat-action-${index}`,
          revision,
          {
            action: { type: entry.action },
            type: "SubmitBettingAction",
          },
          {
            actor: { kind: "seat", seatId: entry.actorSeatId },
            handId: "hand-1",
          },
        ),
      ),
    ).resolves.toMatchObject({ revision: revision + 1, status: "accepted" });
    revision += 1;
  }
  await expect(
    authority.submit(
      command(
        "prepare-three-seat-settlement",
        revision,
        { type: "PrepareSettlement" },
        { handId: "hand-1" },
      ),
    ),
  ).resolves.toMatchObject({ revision: revision + 1, status: "accepted" });
  revision += 1;
  await expect(
    authority.submit(
      command(
        "confirm-three-seat-settlement",
        revision,
        { type: "ConfirmSettlement" },
        { handId: "hand-1" },
      ),
    ),
  ).resolves.toMatchObject({ revision: revision + 1, status: "accepted" });
  revision += 1;
  expect(authority.project({ kind: "public" }).accounting?.seats).toMatchObject(
    [
      { seatId: "alice", stack: 0 },
      { seatId: "bob", stack: 302 },
      { seatId: "charlie", stack: 198 },
    ],
  );
  return { authority, revision };
}

async function settleActiveHeadsUpHand(
  authority: ReturnType<typeof createAuthority>["authority"],
  handId: string,
  firstActorSeatId: string,
  nextActorSeatId: string,
  revision: number,
): Promise<number> {
  const actions = [
    { seatId: firstActorSeatId, type: "call" as const },
    { seatId: nextActorSeatId, type: "check" as const },
    { seatId: nextActorSeatId, type: "check" as const },
    { seatId: firstActorSeatId, type: "check" as const },
    { seatId: nextActorSeatId, type: "check" as const },
    { seatId: firstActorSeatId, type: "check" as const },
    { seatId: nextActorSeatId, type: "check" as const },
    { seatId: firstActorSeatId, type: "check" as const },
  ];
  for (const [index, action] of actions.entries()) {
    await expect(
      authority.submit(
        command(
          `${handId}-action-${index}`,
          revision,
          { action: { type: action.type }, type: "SubmitBettingAction" },
          { actor: { kind: "seat", seatId: action.seatId }, handId },
        ),
      ),
    ).resolves.toMatchObject({ revision: revision + 1, status: "accepted" });
    revision += 1;
  }
  await expect(
    authority.submit(
      command(
        `${handId}-prepare`,
        revision,
        { type: "PrepareSettlement" },
        {
          handId,
        },
      ),
    ),
  ).resolves.toMatchObject({ revision: revision + 1, status: "accepted" });
  revision += 1;
  await expect(
    authority.submit(
      command(
        `${handId}-confirm`,
        revision,
        { type: "ConfirmSettlement" },
        {
          handId,
        },
      ),
    ),
  ).resolves.toMatchObject({ revision: revision + 1, status: "accepted" });
  return revision + 1;
}

describe("digital play-chip top-ups", () => {
  test("adds chips to one seat and the session total between hands", () => {
    const accounting = createDigitalAccounting({
      bigBlind: 2,
      housePolicyId: "p2-house-1",
      smallBlind: 1,
    });
    const created = accounting.submit(undefined, {
      seats: [
        { seatId: "alice", stack: 100 },
        { seatId: "bob", stack: 100 },
      ],
      type: "CreateSession",
    });
    if (created.status !== "accepted") throw new Error("invalid fixture");

    const toppedUp = accounting.submit(created.state, {
      amount: 25,
      seatId: "alice",
      type: "TopUpChips",
    });

    expect(toppedUp).toMatchObject({
      events: [{ amount: 25, seatId: "alice", type: "ChipsToppedUp" }],
      state: {
        phase: "between-hands",
        seats: [
          { seatId: "alice", stack: 125 },
          { seatId: "bob", stack: 100 },
        ],
        sessionTotal: 225,
      },
      status: "accepted",
    });
  });

  test("rejects invalid, overflowing, and in-hand additions without mutation", () => {
    const accounting = createDigitalAccounting({
      bigBlind: 2,
      housePolicyId: "p2-house-1",
      smallBlind: 1,
    });
    const created = accounting.submit(undefined, {
      seats: [
        { seatId: "alice", stack: 100 },
        { seatId: "bob", stack: 100 },
      ],
      type: "CreateSession",
    });
    if (created.status !== "accepted") throw new Error("invalid fixture");
    const lobbyBefore = structuredClone(created.state);
    for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        accounting.submit(created.state, {
          amount,
          seatId: "alice",
          type: "TopUpChips",
        }),
      ).toMatchObject({ code: "invalid-amount", status: "rejected" });
      expect(created.state).toEqual(lobbyBefore);
    }
    expect(
      accounting.submit(created.state, {
        amount: 10,
        seatId: "nobody",
        type: "TopUpChips",
      }),
    ).toMatchObject({ code: "command-not-allowed", status: "rejected" });

    const nearLimit = accounting.submit(undefined, {
      seats: [
        { seatId: "alice", stack: Number.MAX_SAFE_INTEGER - 10 },
        { seatId: "bob", stack: 10 },
      ],
      type: "CreateSession",
    });
    if (nearLimit.status !== "accepted") throw new Error("invalid fixture");
    expect(
      accounting.submit(nearLimit.state, {
        amount: 20,
        seatId: "alice",
        type: "TopUpChips",
      }),
    ).toMatchObject({ code: "invalid-amount", status: "rejected" });
    expect(nearLimit.state.sessionTotal).toBe(Number.MAX_SAFE_INTEGER);
    expect(nearLimit.state.seats[0]?.stack).toBe(Number.MAX_SAFE_INTEGER - 10);

    const hand = accounting.submit(created.state, {
      activeSeatIds: ["alice", "bob"],
      dealerSeatId: "alice",
      handId: "hand-1",
      type: "StartHand",
    });
    if (hand.status !== "accepted") throw new Error("invalid fixture");
    const handBefore = structuredClone(hand.state);
    expect(
      accounting.submit(hand.state, {
        amount: 10,
        seatId: "alice",
        type: "TopUpChips",
      }),
    ).toMatchObject({ code: "command-not-allowed", status: "rejected" });
    expect(hand.state).toEqual(handBefore);
  });

  test("accepts a host top-up through Game Core in the digital lobby", async () => {
    const { authority, store } = createAuthority();
    await expect(createDigitalTable(authority)).resolves.toMatchObject({
      revision: 1,
      status: "accepted",
    });

    const topUp = command("top-up", 1, {
      amount: 25,
      seatId: "alice",
      type: "TopUpChips",
    });
    const receipt = await authority.submit(topUp);
    expect(receipt).toMatchObject({
      events: [{ amount: 25, seatId: "alice", type: "ChipsToppedUp" }],
      revision: 2,
      status: "accepted",
    });
    await expect(authority.submit(topUp)).resolves.toEqual(receipt);
    expect(authority.history().at(-1)).toMatchObject({
      amount: 25,
      seatId: "alice",
      type: "ChipsToppedUp",
    });
    expect(
      authority.history().filter((event) => event.type === "ChipsToppedUp"),
    ).toHaveLength(1);
    expect(authority.project({ kind: "public" }).accounting).toMatchObject({
      seats: [
        { seatId: "alice", stack: 125 },
        { seatId: "bob", stack: 100 },
      ],
      sessionTotal: 225,
    });

    await expect(
      authority.submit(
        command(
          "non-host-top-up",
          2,
          { amount: 10, seatId: "alice", type: "TopUpChips" },
          { actor: { kind: "seat", seatId: "alice" } },
        ),
      ),
    ).resolves.toMatchObject({
      code: "command-not-allowed",
      revision: 2,
      status: "rejected",
    });
    await expect(
      authority.submit(
        command("invalid-top-up", 2, {
          amount: 0,
          seatId: "alice",
          type: "TopUpChips",
        }),
      ),
    ).resolves.toMatchObject({
      code: "command-not-allowed",
      revision: 2,
      status: "rejected",
    });
    expect(authority.project({ kind: "public" }).revision).toBe(2);

    const recovered = createTrustedHostAuthority({
      authorityEpoch: "epoch-1",
      custody: createCardCustody({ shuffler: () => orderedDeck }),
      handIdFactory: () => "unused-hand",
      store,
      tableId: "table-1",
    });
    await expect(recovered.recover()).resolves.toMatchObject({
      revision: 2,
      status: "recovered",
    });
    expect(recovered.project({ kind: "public" }).accounting).toMatchObject({
      seats: [
        { seatId: "alice", stack: 125 },
        { seatId: "bob", stack: 100 },
      ],
      sessionTotal: 225,
    });
    await expect(recovered.submit(topUp)).resolves.toEqual(receipt);
    expect(
      recovered.history().filter((event) => event.type === "ChipsToppedUp"),
    ).toHaveLength(1);
  });

  test("rejects top-ups from a physical table and leaves failed commits unchanged", async () => {
    const physical = createAuthority().authority;
    await expect(
      physical.submit(
        command("create-physical", 0, {
          dealerSeatId: "alice",
          seats: [
            { displayName: "Alice", seatId: "alice" },
            { displayName: "Bob", seatId: "bob" },
          ],
          type: "CreateTable",
        }),
      ),
    ).resolves.toMatchObject({ revision: 1, status: "accepted" });
    await expect(
      physical.submit(
        command("physical-top-up", 1, {
          amount: 25,
          seatId: "alice",
          type: "TopUpChips",
        }),
      ),
    ).resolves.toMatchObject({
      code: "command-not-allowed",
      revision: 1,
      status: "rejected",
    });

    const durable = createMemoryTableStore<PersistedAuthorityState>();
    let failNextCommit = false;
    const store: AtomicTableStore<PersistedAuthorityState> = {
      async commit(expectedRevision, next) {
        if (failNextCommit) {
          failNextCommit = false;
          return { reason: "unavailable", status: "failed" };
        }
        return durable.commit(expectedRevision, next);
      },
      load: () => durable.load(),
      remove: () => durable.remove(),
    };
    const { authority } = createAuthority(store);
    await createDigitalTable(authority);
    failNextCommit = true;
    const topUp = command("retry-top-up", 1, {
      amount: 25,
      seatId: "alice",
      type: "TopUpChips",
    });
    await expect(authority.submit(topUp)).resolves.toMatchObject({
      code: "persistence-failed",
      revision: 1,
      status: "rejected",
    });
    expect(authority.project({ kind: "public" })).toMatchObject({
      revision: 1,
      accounting: { sessionTotal: 200 },
    });
    expect(
      authority.history().some((event) => event.type === "ChipsToppedUp"),
    ).toBe(false);
    expect((await store.load())?.revision).toBe(1);

    await expect(authority.submit(topUp)).resolves.toMatchObject({
      events: [{ amount: 25, seatId: "alice", type: "ChipsToppedUp" }],
      revision: 2,
      status: "accepted",
    });
    expect(authority.project({ kind: "public" }).accounting?.sessionTotal).toBe(
      225,
    );
  });

  test("continues the same digital roster after confirmed settlement", async () => {
    const { authority, shuffleCount } = createAuthority();
    await expect(createDigitalTable(authority)).resolves.toMatchObject({
      revision: 1,
      status: "accepted",
    });
    let revision = await settleHeadsUpHand(authority);
    expect(authority.project({ kind: "public" }).accounting).toMatchObject({
      phase: "complete",
      seats: [
        { seatId: "alice", stack: 100 },
        { seatId: "bob", stack: 100 },
      ],
    });

    await expect(
      authority.submit(
        command(`top-up-after-${revision}`, revision, {
          amount: 20,
          seatId: "alice",
          type: "TopUpChips",
        }),
      ),
    ).resolves.toMatchObject({
      events: [{ amount: 20, seatId: "alice", type: "ChipsToppedUp" }],
      revision: revision + 1,
      status: "accepted",
    });
    revision += 1;
    expect(authority.history().at(-1)).not.toHaveProperty("handId");

    await expect(
      authority.submit(
        command(`start-hand-${revision}`, revision, { type: "StartHand" }),
      ),
    ).resolves.toMatchObject({ revision: revision + 1, status: "accepted" });
    revision += 1;

    expect(shuffleCount()).toBe(2);
    const publicView = authority.project({ kind: "public" });
    expect(publicView).toMatchObject({
      accounting: {
        phase: "betting",
        seats: [
          { seatId: "alice", stack: 118 },
          { seatId: "bob", stack: 99 },
        ],
        sessionTotal: 220,
      },
      board: [],
      dealerSeatId: "bob",
      handId: "hand-2",
      phase: "preflop",
      seats: [{ seatId: "alice" }, { seatId: "bob" }],
    });
    expect(JSON.stringify(publicView)).not.toContain("holeCards");
    const aliceView = authority.project({ kind: "seat", seatId: "alice" });
    if (!("self" in aliceView)) throw new Error("missing seat projection");
    expect(aliceView.self.holeCards).toHaveLength(2);

    await expect(
      authority.submit(
        command(
          "stale-hand-action",
          revision,
          {
            action: { type: "call" },
            type: "SubmitBettingAction",
          },
          { actor: { kind: "seat", seatId: "alice" }, handId: "hand-1" },
        ),
      ),
    ).resolves.toEqual({
      code: "hand-mismatch",
      revision,
      status: "rejected",
    });
    await expect(
      authority.submit(
        command("manual-digital-dealer", revision, {
          type: "RelocateDealer",
          dealerSeatId: "alice",
        }),
      ),
    ).resolves.toMatchObject({ status: "rejected" });
    const settledAgain = await settleActiveHeadsUpHand(
      authority,
      "hand-2",
      "bob",
      "alice",
      revision,
    );
    await expect(
      authority.submit(
        command("third-hand", settledAgain, { type: "StartHand" }),
      ),
    ).resolves.toMatchObject({ status: "accepted" });
    expect(authority.project({ kind: "public" })).toMatchObject({
      handId: "hand-3",
      dealerSeatId: "alice",
    });
    expect(shuffleCount()).toBe(3);
  });

  test("starts with only sitting-in players who still have chips", async () => {
    const { authority, revision: firstSettlementRevision } =
      await createBustedThreeSeatTable();

    await expect(
      authority.submit(
        command(
          `start-with-live-seats-${firstSettlementRevision}`,
          firstSettlementRevision,
          { type: "StartHand" },
        ),
      ),
    ).resolves.toMatchObject({
      revision: firstSettlementRevision + 1,
      status: "accepted",
    });
    const nextHand = authority.project({ kind: "public" });
    expect(nextHand).toMatchObject({
      dealerSeatId: "bob",
      handId: "hand-2",
      phase: "preflop",
      seats: [
        { seatId: "alice", status: "sitting-out" },
        { seatId: "bob", status: "active" },
        { seatId: "charlie", status: "active" },
      ],
    });
    expect(nextHand.accounting?.seats[0]).toMatchObject({
      seatId: "alice",
      stack: 0,
      status: "folded",
    });

    const completedMissedHandRevision = await settleActiveHeadsUpHand(
      authority,
      "hand-2",
      "bob",
      "charlie",
      firstSettlementRevision + 1,
    );
    expect(authority.project({ kind: "public" }).seats[0]).toMatchObject({
      seatId: "alice",
      status: "sitting-out",
    });
    const stateBeforeRejectedTopUp = authority.project({ kind: "public" });
    const historyLengthBeforeRejectedTopUp = authority.history().length;
    await expect(
      authority.submit(
        command("top-up-after-skipped-hand", completedMissedHandRevision, {
          amount: 10,
          seatId: "alice",
          type: "TopUpChips",
        }),
      ),
    ).resolves.toMatchObject({
      code: "command-not-allowed",
      revision: completedMissedHandRevision,
      status: "rejected",
    });
    expect(authority.project({ kind: "public" })).toEqual(
      stateBeforeRejectedTopUp,
    );
    expect(authority.history()).toHaveLength(historyLengthBeforeRejectedTopUp);
  });

  test("allows immediate top-up of a busted seat before it misses a deal", async () => {
    const { authority, revision } = await createBustedThreeSeatTable();
    await expect(
      authority.submit(
        command("immediate-reload", revision, {
          amount: 50,
          seatId: "alice",
          type: "TopUpChips",
        }),
      ),
    ).resolves.toMatchObject({
      events: [{ amount: 50, seatId: "alice", type: "ChipsToppedUp" }],
      revision: revision + 1,
      status: "accepted",
    });
    await expect(
      authority.submit(
        command("start-after-immediate-reload", revision + 1, {
          type: "StartHand",
        }),
      ),
    ).resolves.toMatchObject({ revision: revision + 2, status: "accepted" });
    expect(authority.project({ kind: "public" })).toMatchObject({
      handId: "hand-2",
      seats: [
        { seatId: "alice", status: "active" },
        { seatId: "bob", status: "active" },
        { seatId: "charlie", status: "active" },
      ],
    });
  });
});
