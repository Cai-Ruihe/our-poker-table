import { describe, expect, test } from "vitest";
import {
  createDigitalAccounting,
  type AccountingCommand,
  type AccountingState,
} from "@html-poker/accounting";

function table(stacks: number[], dealerSeatId = "s0") {
  const accounting = createDigitalAccounting({
    smallBlind: 1,
    bigBlind: 2,
    housePolicyId: "p2-house-1",
  });
  let state: AccountingState | undefined;
  function act(command: AccountingCommand) {
    const result = accounting.submit(state, command);
    if (result.status !== "accepted") throw new Error(result.code);
    state = result.state;
    expect(accounting.validate(state)).toBe(true);
    return state;
  }
  act({
    type: "CreateSession",
    seats: stacks.map((stack, i) => ({ seatId: `s${i}`, stack })),
  });
  act({
    type: "StartHand",
    activeSeatIds: stacks.map((_, i) => `s${i}`),
    dealerSeatId,
    handId: "h1",
  });
  return {
    accounting,
    act,
    get state() {
      return state!;
    },
  };
}

describe("digital accounting multiway boundaries", () => {
  test("postflop starts clockwise after the dealer when the adjacent seat folded", () => {
    const t = table([100, 100, 100, 100], "s2");
    t.act({ type: "Call", seatId: "s1" });
    t.act({ type: "Call", seatId: "s2" });
    t.act({ type: "Fold", seatId: "s3" });
    t.act({ type: "Check", seatId: "s0" });
    expect(t.state.street).toBe("flop");
    expect(t.state.pendingSeatIds).toEqual(["s0", "s1", "s2"]);
    // On the turn the first physical seat after the button is still folded.
    for (const seatId of ["s0", "s1", "s2"]) t.act({ type: "Check", seatId });
    expect(t.state.pendingSeatIds).toEqual(["s0", "s1", "s2"]);
  });

  test("skips a folded adjacent seat without jumping back before the button", () => {
    const t = table([100, 100, 100, 100, 100], "s1");
    for (const seatId of ["s4", "s0", "s1"]) t.act({ type: "Call", seatId });
    t.act({ type: "Fold", seatId: "s2" });
    t.act({ type: "Check", seatId: "s3" });
    expect(t.state.pendingSeatIds).toEqual(["s3", "s4", "s0", "s1"]);
  });

  test("does not offer a raise when every opponent is all-in", () => {
    const t = table([10, 100]);
    t.act({ type: "AllIn", seatId: "s0" });
    expect(t.accounting.legalActions(t.state, "s1")).toEqual([
      { type: "fold" },
      { type: "call", amount: 8 },
    ]);
    expect(
      t.accounting.submit(t.state, { type: "AllIn", seatId: "s1" }).status,
    ).toBe("rejected");
    t.act({ type: "Call", seatId: "s1" });
    expect(t.state.phase).toBe("showdown");
  });

  test("derives nested side pots and confirms each eligible award exactly once", () => {
    const t = table([10, 20, 40, 40]);
    t.act({ type: "AllIn", seatId: "s3" });
    for (const seatId of ["s0", "s1", "s2"]) t.act({ type: "Call", seatId });
    expect(t.accounting.project(t.state).pots).toEqual([
      { amount: 40, eligibleSeatIds: ["s0", "s1", "s2", "s3"] },
      { amount: 30, eligibleSeatIds: ["s1", "s2", "s3"] },
      { amount: 40, eligibleSeatIds: ["s2", "s3"] },
    ]);
    expect(
      t.accounting.submit(t.state, {
        type: "ProposeSettlement",
        explanations: ["main", "side", "side"],
        winnersByPot: [["s0"], ["s0"], ["s2"]],
      }).status,
    ).toBe("rejected");
    t.act({
      type: "ProposeSettlement",
      explanations: ["main", "side", "side"],
      winnersByPot: [["s0"], ["s1"], ["s2", "s3"]],
    });
    expect(t.state.seats.map((s) => s.stack)).toEqual([0, 0, 0, 0]);
    t.act({ type: "ConfirmSettlement" });
    expect(t.state.seats.map((s) => s.stack)).toEqual([40, 30, 20, 20]);
    expect(
      t.accounting.submit(t.state, { type: "ConfirmSettlement" }).status,
    ).toBe("rejected");
  });
});
