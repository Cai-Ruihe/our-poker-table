import { expect, test } from "vitest";
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

const prefix: Card[] = [
  "As",
  "Ks",
  "Ah",
  "Kh",
  "2c",
  "3c",
  "4d",
  "8h",
  "5c",
  "9s",
  "6c",
  "Jd",
];
const deck = [
  ...prefix,
  ...["c", "d", "h", "s"]
    .flatMap((suit) =>
      ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"].map(
        (rank) => `${rank}${suit}` as Card,
      ),
    )
    .filter((card) => !prefix.includes(card)),
];
async function fixture() {
  const base = createMemoryTableStore<PersistedAuthorityState>();
  let fail = false;
  const store: AtomicTableStore<PersistedAuthorityState> = {
    ...base,
    commit: (revision, next) =>
      fail
        ? Promise.resolve({ status: "failed", reason: "unavailable" })
        : base.commit(revision, next),
  };
  const makeAuthority = () =>
    createTrustedHostAuthority({
      authorityEpoch: "epoch",
      custody: createCardCustody({ shuffler: () => deck }),
      handIdFactory: () => "hand",
      store,
      tableId: "table",
    });
  const authority = makeAuthority();
  let id = 0;
  const send = (payload: CommandEnvelope["payload"], seatId?: string) => {
    let revision = 0;
    try {
      revision = authority.project({ kind: "public" }).revision;
    } catch {
      /* Creation has no projection. */
    }
    return authority.submit({
      actor: seatId
        ? { kind: "seat", seatId }
        : { kind: "trusted-host", actorId: "host" },
      authorityEpoch: "epoch",
      commandId: `command-${++id}`,
      expectedRevision: revision,
      ...(revision >= 2 ? { handId: "hand" } : {}),
      payload,
      tableId: "table",
    });
  };
  await send({
    type: "CreateTable",
    dealerSeatId: "alice",
    rulesProfile: {
      id: "nlhe-home-v1",
      housePolicyId: "p2-house-1",
      smallBlind: 1,
      bigBlind: 2,
      startingStack: 100,
    },
    seats: [
      { seatId: "alice", displayName: "Alice" },
      { seatId: "bob", displayName: "Bob" },
    ],
  });
  await send({ type: "StartHand" });
  return {
    authority,
    send,
    base,
    makeAuthority,
    failNext: (value: boolean) => {
      fail = value;
    },
  };
}

test("digital Show is an own-seat post-betting choice, persisted before exposure and retained on recovery", async () => {
  const { authority, send, failNext, makeAuthority } = await fixture();
  expect(await send({ type: "ShowCards" }, "bob")).toMatchObject({
    status: "rejected",
  });
  await send(
    { type: "SubmitBettingAction", action: { type: "call" } },
    "alice",
  );
  for (const seat of ["bob", "bob", "alice", "bob", "alice", "bob", "alice"]) {
    expect(
      await send(
        { type: "SubmitBettingAction", action: { type: "check" } },
        seat,
      ),
    ).toMatchObject({ status: "accepted" });
  }
  await send({ type: "PrepareSettlement" });
  const before = authority.project({ kind: "public" });
  expect(
    before.seats.find((seat) => seat.seatId === "alice")?.holeCards,
  ).toEqual(["As", "Ah"]);
  expect(
    before.seats.find((seat) => seat.seatId === "bob")?.holeCards,
  ).toBeUndefined();
  expect(await send({ type: "ShowCards" })).toMatchObject({
    status: "rejected",
  });
  expect(await send({ type: "ShowCards" }, "stranger")).toMatchObject({
    status: "rejected",
  });
  failNext(true);
  expect(await send({ type: "ShowCards" }, "bob")).toMatchObject({
    status: "rejected",
  });
  expect(authority.project({ kind: "public" })).toEqual(before);
  failNext(false);
  expect(await send({ type: "ShowCards" }, "bob")).toMatchObject({
    status: "accepted",
  });
  const shown = authority.project({ kind: "public" });
  expect(shown.seats.find((seat) => seat.seatId === "bob")?.holeCards).toEqual([
    "Ks",
    "Kh",
  ]);
  expect(shown.showdown?.leaders).toEqual(["alice"]);
  expect(shown.accounting).toEqual(before.accounting);
  expect(await send({ type: "ShowCards" }, "bob")).toMatchObject({
    status: "rejected",
  });
  expect(authority.project({ kind: "public" })).toEqual(shown);
  const recovered = makeAuthority();
  expect(await recovered.recover()).toMatchObject({ status: "recovered" });
  expect(recovered.project({ kind: "public" })).toEqual(shown);
});

test("fold-win never forces cards public; folded seat cannot show, and confirmation closes voluntary Show", async () => {
  const { authority, send } = await fixture();
  await send(
    { type: "SubmitBettingAction", action: { type: "fold" } },
    "alice",
  );
  await send({ type: "PrepareSettlement" });
  expect(
    authority
      .project({ kind: "public" })
      .seats.every((seat) => !seat.holeCards),
  ).toBe(true);
  expect(await send({ type: "ShowCards" }, "alice")).toMatchObject({
    status: "rejected",
  });
  expect(await send({ type: "ShowCards" }, "bob")).toMatchObject({
    status: "accepted",
  });
  expect(
    authority
      .project({ kind: "public" })
      .seats.find((seat) => seat.seatId === "alice")?.holeCards,
  ).toBeUndefined();
  const other = await fixture();
  await other.send(
    { type: "SubmitBettingAction", action: { type: "fold" } },
    "alice",
  );
  await other.send({ type: "PrepareSettlement" });
  await other.send({ type: "ConfirmSettlement" });
  expect(await other.send({ type: "ShowCards" }, "bob")).toMatchObject({
    status: "rejected",
  });
  expect(
    other.authority
      .project({ kind: "public" })
      .seats.every((seat) => !seat.holeCards),
  ).toBe(true);
});

test("recovered preview-2 synthetic muck can deliberately show, without exposing folded cards", async () => {
  const { send, base, makeAuthority } = await fixture();
  await send(
    { type: "SubmitBettingAction", action: { type: "fold" } },
    "alice",
  );
  await send({ type: "PrepareSettlement" });
  const persisted = await base.load();
  if (!persisted) throw new Error("Fixture must be persisted");
  await base.commit(persisted.revision, {
    ...persisted,
    state: {
      ...persisted.state,
      seats: persisted.state.seats.map((seat) =>
        seat.seatId === "bob" ? { ...seat, status: "mucked" } : seat,
      ),
    },
  });
  const recovered = makeAuthority();
  await recovered.recover();
  expect(
    await recovered.submit({
      actor: { kind: "seat", seatId: "bob" },
      authorityEpoch: "epoch",
      commandId: "legacy-show",
      expectedRevision: persisted.revision,
      handId: "hand",
      tableId: "table",
      payload: { type: "ShowCards" },
    }),
  ).toMatchObject({ status: "accepted" });
  const projection = recovered.project({ kind: "public" });
  expect(
    projection.seats.find((seat) => seat.seatId === "bob")?.holeCards,
  ).toEqual(["Ks", "Kh"]);
  expect(
    projection.seats.find((seat) => seat.seatId === "alice")?.holeCards,
  ).toBeUndefined();
});

test("voluntary showdown Show stays public when the proposal is prepared", async () => {
  const { authority, send } = await fixture();
  await send(
    { type: "SubmitBettingAction", action: { type: "fold" } },
    "alice",
  );
  expect(authority.project({ kind: "public" }).phase).toBe("showdown");
  expect(await send({ type: "ShowCards" }, "bob")).toMatchObject({
    status: "accepted",
  });
  await send({ type: "PrepareSettlement" });
  expect(
    authority
      .project({ kind: "public" })
      .seats.find((seat) => seat.seatId === "bob")?.holeCards,
  ).toEqual(["Ks", "Kh"]);
});

test("public history is atomic, timestamped and never backfills hidden cards into earlier steps", async () => {
  const { authority, send, failNext, makeAuthority } = await fixture();
  const initial = authority.publicHistory();
  expect(initial.completeFromFirstHand).toBe(true);
  expect(initial.frames).toHaveLength(1);
  expect(initial.frames[0]?.action.type).toBe("StartHand");
  expect(Number.isNaN(Date.parse(initial.frames[0]?.at ?? ""))).toBe(false);
  expect(
    initial.frames[0]?.events.filter(
      (event) => event.type === "ForcedBetPosted",
    ),
  ).toEqual([
    { type: "ForcedBetPosted", seatId: "alice", amount: 1 },
    { type: "ForcedBetPosted", seatId: "bob", amount: 2 },
  ]);
  expect(initial.frames[0]?.seats.every((seat) => !seat.holeCards)).toBe(true);
  failNext(true);
  await send(
    { type: "SubmitBettingAction", action: { type: "call" } },
    "alice",
  );
  expect(authority.publicHistory().frames).toEqual(initial.frames);
  failNext(false);
  await send(
    { type: "SubmitBettingAction", action: { type: "call" } },
    "alice",
  );
  expect(authority.publicHistory().frames.at(-1)?.action).toEqual({
    type: "call",
    seatId: "alice",
    amount: 1,
  });
  await send({ type: "SubmitBettingAction", action: { type: "fold" } }, "bob");
  await send({ type: "PrepareSettlement" });
  await send({ type: "ShowCards" }, "alice");
  const history = authority.publicHistory();
  expect(
    history.frames.at(-1)?.seats.find((seat) => seat.seatId === "alice")
      ?.holeCards,
  ).toEqual(["As", "Ah"]);
  expect(
    history.frames
      .slice(0, -1)
      .every((frame) => frame.seats.every((seat) => !seat.holeCards)),
  ).toBe(true);
  expect(JSON.stringify(history)).not.toContain('"Ks"');
  expect(JSON.stringify(history)).not.toContain('"Kh"');
  expect(JSON.stringify(history)).not.toMatch(
    /custody|credential|ciphertext|acceptedCommands|authorityEpoch/,
  );
  const recovered = makeAuthority();
  expect(await recovered.recover()).toMatchObject({ status: "recovered" });
  expect(recovered.publicHistory().frames).toEqual(history.frames);
});
