import { expect, test } from "vitest";
import {
  createDigitalAccounting,
  type AccountingCommand,
  type AccountingState,
  type LegalAction,
} from "@html-poker/accounting";

function intent(seatId: string, action: LegalAction): AccountingCommand {
  switch (action.type) {
    case "call":
      return { type: "Call", seatId };
    case "check":
      return { type: "Check", seatId };
    case "fold":
      return { type: "Fold", seatId };
    case "all-in":
      return { type: "AllIn", seatId };
    case "bet-to":
    case "raise-to":
      return { type: "BetOrRaiseTo", seatId, to: action.minTo };
  }
}

test("seeded two-to-ten-seat legal sequences conserve chips and replay deterministically", () => {
  for (let seed = 1; seed <= 180; seed++) {
    let random = seed;
    const draw = (n: number) => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return random % n;
    };
    const engine = createDigitalAccounting({
      smallBlind: 1,
      bigBlind: 2,
      housePolicyId: "p2-house-1",
    });
    const count = 2 + (seed % 9);
    const seats = Array.from({ length: count }, (_, i) => ({
      seatId: `s${i}`,
      stack: 1 + draw(60),
    }));
    const commands: AccountingCommand[] = [];
    let state: AccountingState | undefined;
    const act = (command: AccountingCommand) => {
      commands.push(command);
      const result = engine.submit(state, command);
      if (result.status !== "accepted")
        throw new Error(`seed ${seed}: rejected ${JSON.stringify(command)}`);
      state = result.state;
      expect(
        engine.validate(state),
        `seed ${seed}, command ${commands.length}`,
      ).toBe(true);
      expect(
        state.seats.reduce(
          (sum, seat) => sum + seat.stack + seat.totalContribution,
          0,
        ),
      ).toBe(seats.reduce((sum, seat) => sum + seat.stack, 0));
      return state;
    };
    act({ type: "CreateSession", seats });
    let hand = act({
      type: "StartHand",
      activeSeatIds: seats.map((s) => s.seatId),
      dealerSeatId: seats[draw(count)]!.seatId,
      handId: `h${seed}`,
    });
    while (hand.phase === "betting") {
      expect(commands.length).toBeLessThan(250);
      const actor = hand.currentActorSeatId!;
      const actions = engine.legalActions(hand, actor);
      expect(actions.length).toBeGreaterThan(0);
      hand = act(intent(actor, actions[draw(actions.length)]!));
    }
    expect(hand.phase).toBe("showdown");
    const pots = engine.project(hand).pots!;
    act({
      type: "ProposeSettlement",
      explanations: pots.map(() => "Deterministic test award."),
      winnersByPot: pots.map((pot) => [pot.eligibleSeatIds[0]!]),
    });
    const final = act({ type: "ConfirmSettlement" });
    let replay: AccountingState | undefined;
    for (const command of commands) {
      const result = engine.submit(replay, command);
      if (result.status !== "accepted") throw new Error("replay rejected");
      replay = result.state;
    }
    expect(replay).toEqual(final);
  }
});
