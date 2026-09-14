import { describe, expect, test } from "vitest";

import {
  createDigitalAccounting,
  type AccountingCommand,
  type AccountingState,
} from "@html-poker/accounting";

function session(stacks: readonly number[]) {
  const accounting = createDigitalAccounting({
    bigBlind: 2,
    housePolicyId: "p2-house-1",
    smallBlind: 1,
  });
  let state: AccountingState | undefined;

  function act(command: AccountingCommand): AccountingState {
    const result = accounting.submit(state, command);
    if (result.status !== "accepted") throw new Error(result.code);
    state = result.state;
    expect(accounting.validate(state)).toBe(true);
    return state;
  }

  act({
    seats: stacks.map((stack, index) => ({ seatId: `s${index}`, stack })),
    type: "CreateSession",
  });

  return {
    accounting,
    act,
    get state(): AccountingState {
      if (!state) throw new Error("The accounting session has not started.");
      return state;
    },
  };
}

function table(stacks: readonly number[], dealerSeatId = "s0") {
  const t = session(stacks);
  t.act({
    activeSeatIds: stacks.map((_, index) => `s${index}`),
    dealerSeatId,
    handId: "h1",
    type: "StartHand",
  });
  return t;
}

function fourSeatFlop(bigBlindStack = 17) {
  const t = table([100, 101, bigBlindStack, 100]);
  t.act({ seatId: "s3", type: "Call" });
  t.act({ seatId: "s0", type: "Call" });
  t.act({ seatId: "s1", type: "Call" });
  t.act({ seatId: "s2", type: "Check" });
  return t;
}

function fiveSeatCumulativeShortAllIns() {
  // With s0 on the button, postflop action runs s1 (A), s2 (B), s3 (C),
  // s4 (D), then s0 (E). B and D have 125 and 200 chips after the blinds.
  const t = table([500, 500, 127, 500, 202]);
  t.act({ seatId: "s3", type: "Call" });
  t.act({ seatId: "s4", type: "Call" });
  t.act({ seatId: "s0", type: "Call" });
  t.act({ seatId: "s1", type: "Call" });
  t.act({ seatId: "s2", type: "Check" });

  t.act({ seatId: "s1", to: 100, type: "BetOrRaiseTo" });
  t.act({ seatId: "s2", type: "AllIn" });
  t.act({ seatId: "s3", type: "Call" });
  t.act({ seatId: "s4", type: "AllIn" });
  t.act({ seatId: "s0", type: "Call" });
  return t;
}

describe("digital accounting betting boundaries", () => {
  test("one short all-in does not reopen action for a player who already bet", () => {
    const t = fourSeatFlop();
    t.act({ seatId: "s1", to: 10, type: "BetOrRaiseTo" });
    t.act({ seatId: "s2", type: "AllIn" });
    t.act({ seatId: "s3", type: "Call" });
    t.act({ seatId: "s0", type: "Fold" });

    expect(t.accounting.legalActions(t.state, "s1")).toEqual([
      { type: "fold" },
      { amount: 5, type: "call" },
    ]);
    expect(
      t.accounting.submit(t.state, {
        seatId: "s1",
        to: 25,
        type: "BetOrRaiseTo",
      }).status,
    ).toBe("rejected");
  });

  test("a checked player cannot raise a short opening all-in, while an unacted player must add the full increment", () => {
    const t = fourSeatFlop(3);
    t.act({ seatId: "s1", type: "Check" });
    t.act({ seatId: "s2", type: "AllIn" });
    expect(t.accounting.legalActions(t.state, "s3")).toContainEqual({
      type: "raise-to",
      minTo: 3,
      maxTo: 98,
    });
    expect(
      t.accounting.submit(t.state, {
        seatId: "s3",
        type: "BetOrRaiseTo",
        to: 2,
      }).status,
    ).toBe("rejected");
    t.act({ seatId: "s3", type: "Call" });
    t.act({ seatId: "s0", type: "Fold" });
    expect(t.accounting.legalActions(t.state, "s1")).toEqual([
      { type: "fold" },
      { type: "call", amount: 1 },
    ]);
  });

  test("a lone responder never pays a nominal blind after all betting opponents disappear", () => {
    const t = table([100, 100, 1]);
    const ended = t.act({ seatId: "s0", type: "Fold" });
    expect(ended.phase).toBe("showdown");
    expect(ended.seats.map((seat) => seat.stack)).toEqual([100, 99, 0]);
    expect(t.accounting.project(ended).potTotal).toBe(2);
  });

  test("a player who has not acted may raise over a short all-in", () => {
    const t = fourSeatFlop();
    t.act({ seatId: "s1", to: 10, type: "BetOrRaiseTo" });
    t.act({ seatId: "s2", type: "AllIn" });

    expect(t.accounting.legalActions(t.state, "s3")).toEqual([
      { type: "fold" },
      { amount: 15, type: "call" },
      { maxTo: 98, minTo: 25, type: "raise-to" },
      { to: 98, type: "all-in" },
    ]);
    const raised = t.act({ seatId: "s3", to: 25, type: "BetOrRaiseTo" });
    expect(t.accounting.project(raised).currentBet).toBe(25);
  });

  test("cumulative short all-ins reopen only for players facing a full raise", () => {
    const t = fiveSeatCumulativeShortAllIns();

    // A bet 100; B's all-in to 125 and D's all-in to 200 cumulatively add 100.
    // A can raise, with the last full raise still setting a 300 minimum.
    expect(t.accounting.legalActions(t.state, "s1")).toEqual([
      { type: "fold" },
      { amount: 100, type: "call" },
      { maxTo: 498, minTo: 300, type: "raise-to" },
      { to: 498, type: "all-in" },
    ]);
    const raiseBranch = t.accounting.submit(t.state, {
      seatId: "s1",
      to: 300,
      type: "BetOrRaiseTo",
    });
    expect(raiseBranch.status).toBe("accepted");
    if (raiseBranch.status !== "accepted") throw new Error(raiseBranch.code);
    expect(t.accounting.project(raiseBranch.state).currentBet).toBe(300);

    // If A calls instead, C has faced only 75 more since calling 125, so C
    // still cannot raise even though A's own cumulative short raises reopened.
    t.act({ seatId: "s1", type: "Call" });
    expect(t.accounting.legalActions(t.state, "s3")).toEqual([
      { type: "fold" },
      { amount: 75, type: "call" },
    ]);
    expect(
      t.accounting.submit(t.state, {
        seatId: "s3",
        to: 300,
        type: "BetOrRaiseTo",
      }).status,
    ).toBe("rejected");
  });

  test("a full raise reopens action for a prior bettor", () => {
    const t = fourSeatFlop(22);
    t.act({ seatId: "s1", to: 10, type: "BetOrRaiseTo" });
    t.act({ seatId: "s2", type: "AllIn" });
    t.act({ seatId: "s3", type: "Call" });
    t.act({ seatId: "s0", type: "Fold" });

    expect(t.accounting.legalActions(t.state, "s1")).toEqual([
      { type: "fold" },
      { amount: 10, type: "call" },
      { maxTo: 99, minTo: 30, type: "raise-to" },
      { to: 99, type: "all-in" },
    ]);
    const raised = t.act({ seatId: "s1", to: 30, type: "BetOrRaiseTo" });
    expect(t.accounting.project(raised).currentBet).toBe(30);
  });

  test("does not offer a raise when the only opponent is all-in", () => {
    const t = table([10, 100]);
    t.act({ seatId: "s0", type: "AllIn" });

    expect(t.accounting.legalActions(t.state, "s1")).toEqual([
      { type: "fold" },
      { amount: 8, type: "call" },
    ]);
    expect(
      t.accounting.submit(t.state, { seatId: "s1", type: "AllIn" }).status,
    ).toBe("rejected");
    const called = t.act({ seatId: "s1", type: "Call" });
    expect(t.accounting.project(called).phase).toBe("showdown");
  });

  test("a short big blind preserves the full nominal bring-in in a multiway hand", () => {
    const t = table([100, 100, 1]);

    expect(t.accounting.project(t.state)).toMatchObject({
      currentActorSeatId: "s0",
      currentBet: 2,
      phase: "betting",
      seats: [
        { seatId: "s0", streetContribution: 0 },
        { seatId: "s1", streetContribution: 1 },
        {
          seatId: "s2",
          stack: 0,
          status: "all-in",
          streetContribution: 1,
        },
      ],
      street: "preflop",
    });
    expect(t.accounting.legalActions(t.state, "s0")).toEqual([
      { type: "fold" },
      { amount: 2, type: "call" },
      { maxTo: 100, minTo: 4, type: "raise-to" },
      { to: 100, type: "all-in" },
    ]);

    t.act({ seatId: "s0", type: "Call" });
    expect(t.accounting.legalActions(t.state, "s1")).toContainEqual({
      amount: 1,
      type: "call",
    });
  });

  test("all-in blinds start a valid showdown without waiting for an action", () => {
    const t = table([1, 1]);

    expect(t.accounting.project(t.state)).toMatchObject({
      currentBet: 0,
      phase: "showdown",
      potTotal: 2,
      seats: [
        { seatId: "s0", stack: 0, status: "all-in" },
        { seatId: "s1", stack: 0, status: "all-in" },
      ],
      street: "river",
    });
    expect(t.accounting.validate(t.state)).toBe(true);
    expect(t.accounting.legalActions(t.state, "s0")).toEqual([]);
    expect(t.accounting.legalActions(t.state, "s1")).toEqual([]);
  });

  test("a zero-stack seat cannot be reactivated for the next hand", () => {
    const t = table([1, 1]);
    t.act({
      explanations: ["s0 wins the blind all-in."],
      type: "ProposeSettlement",
      winnersByPot: [["s0"]],
    });
    t.act({ type: "ConfirmSettlement" });
    expect(t.accounting.project(t.state).seats).toContainEqual(
      expect.objectContaining({ seatId: "s1", stack: 0, status: "all-in" }),
    );

    expect(
      t.accounting.submit(t.state, {
        activeSeatIds: ["s0", "s1"],
        dealerSeatId: "s0",
        handId: "h2",
        type: "StartHand",
      }).status,
    ).toBe("rejected");
  });
});
