import { describe, expect, test } from "vitest";
import { createDigitalAccounting } from "@html-poker/accounting";
import { createCardCustody } from "@html-poker/card-custody";
import {
  createTrustedHostAuthority,
  type CommandEnvelope,
  type PersistedAuthorityState,
} from "@html-poker/game-core";
import { createMemoryTableStore } from "@html-poker/persistence";

function setup() {
  const store = createMemoryTableStore<PersistedAuthorityState>();
  const options = {
    authorityEpoch: "e",
    custody: createCardCustody(),
    handIdFactory: () => "h",
    store,
    tableId: "t",
  };
  const authority = createTrustedHostAuthority(options);
  function command(
    id: string,
    revision: number,
    payload: CommandEnvelope["payload"],
    seatId?: string,
  ): CommandEnvelope {
    return {
      actor: seatId
        ? { kind: "seat", seatId }
        : { kind: "trusted-host", actorId: "host" },
      authorityEpoch: "e",
      commandId: id,
      expectedRevision: revision,
      payload,
      tableId: "t",
      ...(revision > 1 ? { handId: "h" } : {}),
    };
  }
  async function create() {
    expect(
      (
        await authority.submit(
          command("create", 0, {
            type: "CreateTable",
            dealerSeatId: "a",
            seats: [
              { seatId: "a", displayName: "A" },
              { seatId: "b", displayName: "B" },
            ],
            rulesProfile: {
              id: "nlhe-home-v1",
              housePolicyId: "p2-house-1",
              smallBlind: 1,
              bigBlind: 2,
              startingStack: 100,
            },
          }),
        )
      ).status,
    ).toBe("accepted");
  }
  return { store, options, authority, command, create };
}

describe("digital betting recovery boundaries", () => {
  test("restores legal actions and duplicate receipts without publishing reopening state", async () => {
    const t = setup();
    await t.create();
    await t.authority.submit(t.command("start", 1, { type: "StartHand" }));
    const call = t.command(
      "call",
      2,
      { type: "SubmitBettingAction", action: { type: "call" } },
      "a",
    );
    const receipt = await t.authority.submit(call);
    const before = t.authority.project({ kind: "seat", seatId: "b" });
    expect(JSON.stringify(before)).not.toContain("lastActions");
    const saved = await t.store.load();
    expect(saved?.state.accounting?.lastActions).toEqual([
      { seatId: "a", bet: 2 },
    ]);
    const recovered = createTrustedHostAuthority(t.options);
    expect((await recovered.recover()).status).toBe("recovered");
    expect(recovered.project({ kind: "seat", seatId: "b" })).toEqual(before);
    expect(await recovered.submit(call)).toEqual(receipt);
  });

  test("rejects a legacy accounting snapshot rather than inventing raise rights", async () => {
    const t = setup();
    await t.create();
    const saved = await t.store.load();
    if (!saved?.state.accounting) throw new Error("missing accounting");
    const state = structuredClone(saved.state);
    Reflect.set(state.accounting!, "schemaVersion", 1);
    Reflect.deleteProperty(state.accounting!, "lastActions");
    await t.store.commit(saved.revision, {
      revision: saved.revision + 1,
      state: { ...state, revision: saved.revision + 1 },
    });
    expect(await createTrustedHostAuthority(t.options).recover()).toEqual({
      status: "rejected",
      code: "corrupt-state",
    });
  });

  test("reveals the complete board on an all-in-blinds recovered lobby and confirms settlement", async () => {
    const t = setup();
    await t.create();
    const saved = await t.store.load();
    if (!saved) throw new Error("missing lobby");
    // The accounting recovery seam supports unequal/short stacks before multi-hand UI admission.
    const short = createDigitalAccounting({
      smallBlind: 1,
      bigBlind: 2,
      housePolicyId: "p2-house-1",
    }).submit(undefined, {
      type: "CreateSession",
      seats: [
        { seatId: "a", stack: 1 },
        { seatId: "b", stack: 1 },
      ],
    });
    if (short.status !== "accepted") throw new Error("invalid fixture");
    await t.store.commit(saved.revision, {
      revision: 2,
      state: { ...saved.state, accounting: short.state, revision: 2 },
    });
    const recovered = createTrustedHostAuthority(t.options);
    expect((await recovered.recover()).status).toBe("recovered");
    expect(
      (
        await recovered.submit(
          t.command("start-short", 2, { type: "StartHand" }),
        )
      ).status,
    ).toBe("accepted");
    const view = recovered.project({ kind: "public" });
    expect(view?.phase).toBe("showdown");
    expect(view?.board).toHaveLength(5);
    expect(view?.accounting?.phase).toBe("showdown");
    expect(JSON.stringify(view)).not.toContain("holeCards");
    expect(
      (
        await recovered.submit(
          t.command("prepare", 3, { type: "PrepareSettlement" }),
        )
      ).status,
    ).toBe("accepted");
    expect(
      (
        await recovered.submit(
          t.command("confirm", 4, { type: "ConfirmSettlement" }),
        )
      ).status,
    ).toBe("accepted");
    expect(
      recovered
        .project({ kind: "public" })
        ?.accounting?.seats.reduce((sum, seat) => sum + seat.stack, 0),
    ).toBe(2);
  });
});
