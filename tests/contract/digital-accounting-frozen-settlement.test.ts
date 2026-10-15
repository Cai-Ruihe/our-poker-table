import { describe, expect, test } from "vitest";
import {
  createDigitalAccounting,
  type AccountingCommand,
  type AccountingState,
} from "@html-poker/accounting";
import frozenInput from "../fixtures/accounting/independent-settlement-vectors.json";

interface FrozenVector {
  id: string;
  seatOrder: string[];
  dealerSeatId: string;
  startingStacks: Record<string, number>;
  commands: AccountingCommand[];
  checkpoints?: {
    afterCommandCount: number;
    actorSeatId: string;
    expected: {
      callAmount: number;
      raiseAllowed: boolean;
      minRaiseTo?: number;
      maxRaiseTo?: number;
      aggressiveAllInAllowed?: boolean;
    };
  }[];
  expected: {
    contributions: Record<string, number>;
    foldedSeatIds: string[];
    preSettlementStacks: Record<string, number>;
    sessionTotal: number;
    totalCommitted: number;
    pots: { amount: number; eligibleSeatIds: string[] }[];
    winnersByPot: string[][];
    orderedWinnerSeatIdsByPot?: string[][];
    awardsByPot: Record<string, number>[];
    finalStacks: Record<string, number>;
    contestedPotTotal?: number;
    uncalledReturn?: Record<string, number>;
  };
  negativeChecks?: { description: string; winnersByPot: string[][] }[];
}

// The independently reviewed JSON supplies all actions and expected values.
// Winners are stipulated ranking inputs: this suite does not test card evaluation.
const vectors = frozenInput.vectors as FrozenVector[];

describe("independent frozen accounting settlement vectors (stipulated winners)", () => {
  test.each(vectors)("$id", (vector) => {
    const accounting = createDigitalAccounting(frozenInput.commonSetup);
    let state: AccountingState | undefined;
    const transitions: { command: string; conservedTotal: number }[] = [];

    function current(): AccountingState {
      if (!state) throw new Error("Session has not been created.");
      return state;
    }

    function stacks() {
      return Object.fromEntries(
        current().seats.map((s) => [s.seatId, s.stack]),
      );
    }

    function contributions() {
      return Object.fromEntries(
        current().seats.map((s) => [s.seatId, s.totalContribution]),
      );
    }

    function act(command: AccountingCommand) {
      const result = accounting.submit(state, command);
      expect(result.status, `${vector.id}: ${JSON.stringify(command)}`).toBe(
        "accepted",
      );
      if (result.status !== "accepted") throw new Error(result.code);
      state = result.state;
      const conservedTotal = state.seats.reduce(
        (total, seat) => total + seat.stack + seat.totalContribution,
        0,
      );
      transitions.push({ command: command.type, conservedTotal });
      expect(conservedTotal).toBe(vector.expected.sessionTotal);
      expect(state.sessionTotal).toBe(vector.expected.sessionTotal);
      for (const seat of state.seats) {
        expect(seat.stack).toBeGreaterThanOrEqual(0);
        expect(seat.totalContribution).toBeGreaterThanOrEqual(0);
      }
      // Additional invariant check, never the expected settlement oracle.
      expect(accounting.validate(state)).toBe(true);
    }

    function rejectUnchanged(command: AccountingCommand, description: string) {
      const before = structuredClone(current());
      const projectionBefore = structuredClone(accounting.project(current()));
      expect(accounting.submit(current(), command).status, description).toBe(
        "rejected",
      );
      expect(current()).toEqual(before);
      expect(accounting.project(current())).toEqual(projectionBefore);
    }

    act({
      type: "CreateSession",
      seats: vector.seatOrder.map((seatId) => ({
        seatId,
        stack: vector.startingStacks[seatId]!,
      })),
    });
    act({
      type: "StartHand",
      activeSeatIds: vector.seatOrder,
      dealerSeatId: vector.dealerSeatId,
      handId: vector.id,
    });

    for (const [index, command] of vector.commands.entries()) {
      act(command);
      for (const checkpoint of vector.checkpoints ?? []) {
        if (checkpoint.afterCommandCount !== index + 1) continue;
        expect(current().currentActorSeatId).toBe(checkpoint.actorSeatId);
        const actions = accounting.legalActions(
          current(),
          checkpoint.actorSeatId,
        );
        expect(actions.find((a) => a.type === "call")).toEqual({
          type: "call",
          amount: checkpoint.expected.callAmount,
        });
        const raise = actions.find((a) => a.type === "raise-to");
        if (checkpoint.expected.raiseAllowed) {
          expect(raise).toEqual({
            type: "raise-to",
            minTo: checkpoint.expected.minRaiseTo,
            maxTo: checkpoint.expected.maxRaiseTo,
          });
        } else {
          expect(raise).toBeUndefined();
        }
        if (checkpoint.expected.aggressiveAllInAllowed === false) {
          expect(actions.some((a) => a.type === "all-in")).toBe(false);
          rejectUnchanged(
            { type: "AllIn", seatId: checkpoint.actorSeatId },
            "A short increase must not reopen an aggressive all-in",
          );
        }
      }
    }

    expect(current().phase).toBe("showdown");
    expect(contributions()).toEqual(vector.expected.contributions);
    expect(
      current()
        .seats.filter((s) => s.status === "folded")
        .map((s) => s.seatId),
    ).toEqual(vector.expected.foldedSeatIds);
    expect(stacks()).toEqual(vector.expected.preSettlementStacks);
    expect(accounting.project(current()).potTotal).toBe(
      vector.expected.totalCommitted,
    );
    expect(accounting.project(current()).pots).toEqual(vector.expected.pots);

    for (const negative of vector.negativeChecks ?? []) {
      rejectUnchanged(
        {
          type: "ProposeSettlement",
          explanations: vector.expected.pots.map(() => "Stipulated winner"),
          winnersByPot: negative.winnersByPot,
        },
        negative.description,
      );
    }

    act({
      type: "ProposeSettlement",
      explanations: vector.expected.pots.map(() => "Stipulated winner"),
      winnersByPot: vector.expected.winnersByPot,
    });
    expect(current().phase).toBe("settlement-pending");
    expect(stacks()).toEqual(vector.expected.preSettlementStacks);
    expect(contributions()).toEqual(vector.expected.contributions);
    const proposal = current().settlement;
    expect(proposal).toBeDefined();
    expect(proposal?.totalPot).toBe(vector.expected.totalCommitted);
    expect(
      proposal?.pots.map(({ amount, eligibleSeatIds }) => ({
        amount,
        eligibleSeatIds,
      })),
    ).toEqual(vector.expected.pots);
    expect(
      proposal?.pots.map((pot) =>
        Object.fromEntries(pot.awards.map((a) => [a.seatId, a.amount])),
      ),
    ).toEqual(vector.expected.awardsByPot);
    expect(proposal?.pots.map((pot) => pot.winnerSeatIds)).toEqual(
      vector.expected.orderedWinnerSeatIdsByPot ?? vector.expected.winnersByPot,
    );
    expect(accounting.project(current()).settlement).toEqual(proposal);

    if (vector.expected.uncalledReturn) {
      // The public contract keeps excess in single-eligible layers until confirm.
      // Only layers with multiple eligible seats are contested chips.
      expect(
        proposal?.pots
          .filter((pot) => pot.eligibleSeatIds.length > 1)
          .reduce((sum, pot) => sum + pot.amount, 0),
      ).toBe(vector.expected.contestedPotTotal);
      expect(
        Object.fromEntries(
          (proposal?.pots ?? [])
            .filter((pot) => pot.eligibleSeatIds.length === 1)
            .flatMap((pot) => pot.awards.map((a) => [a.seatId, a.amount])),
        ),
      ).toEqual(vector.expected.uncalledReturn);
    }

    act({ type: "ConfirmSettlement" });
    expect(current().phase).toBe("complete");
    expect(stacks()).toEqual(vector.expected.finalStacks);
    expect(current().seats.every((s) => s.totalContribution === 0)).toBe(true);
    expect(current().seats.every((s) => s.streetContribution === 0)).toBe(true);
    rejectUnchanged({ type: "ConfirmSettlement" }, "Repeated confirmation");
    expect(transitions).toHaveLength(vector.commands.length + 4);
  });
});
