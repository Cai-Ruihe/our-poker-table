export type AccountingStreet = "preflop" | "flop" | "turn" | "river";

export type AccountingSeatStatus = "active" | "all-in" | "folded";

export interface AccountingSeatState {
  readonly seatId: string;
  readonly stack: number;
  readonly status: AccountingSeatStatus;
  readonly streetContribution: number;
  readonly totalContribution: number;
}

export interface SettlementAward {
  readonly amount: number;
  readonly seatId: string;
}

export interface SettlementPot {
  readonly amount: number;
  readonly awards: readonly SettlementAward[];
  readonly eligibleSeatIds: readonly string[];
  readonly explanation: string;
  readonly winnerSeatIds: readonly string[];
}

export interface SettlementProposal {
  readonly pots: readonly SettlementPot[];
  readonly totalPot: number;
}

export interface AccountingState {
  readonly bigBlind: number;
  readonly currentActorSeatId?: string;
  readonly currentBet: number;
  readonly dealerSeatId?: string;
  readonly handId?: string;
  readonly housePolicyId: string;
  readonly lastFullRaise: number;
  readonly pendingSeatIds: readonly string[];
  readonly phase:
    | "between-hands"
    | "betting"
    | "showdown"
    | "settlement-pending"
    | "complete";
  readonly schemaVersion: 2;
  readonly lastActions: readonly {
    readonly seatId: string;
    readonly bet: number;
  }[];
  readonly sessionTotal: number;
  readonly seats: readonly AccountingSeatState[];
  readonly settlement?: SettlementProposal;
  readonly smallBlind: number;
  readonly street?: AccountingStreet;
}

export type AccountingCommand =
  | {
      readonly seats: readonly {
        readonly seatId: string;
        readonly stack: number;
      }[];
      readonly type: "CreateSession";
    }
  | {
      readonly activeSeatIds: readonly string[];
      readonly dealerSeatId: string;
      readonly handId: string;
      readonly type: "StartHand";
    }
  | { readonly seatId: string; readonly type: "Call" }
  | { readonly seatId: string; readonly type: "Check" }
  | { readonly seatId: string; readonly type: "Fold" }
  | { readonly seatId: string; readonly type: "AllIn" }
  | {
      readonly seatId: string;
      readonly to: number;
      readonly type: "BetOrRaiseTo";
    }
  | {
      readonly explanations: readonly string[];
      readonly type: "ProposeSettlement";
      readonly winnersByPot: readonly (readonly string[])[];
    }
  | { readonly type: "ConfirmSettlement" };

export type AccountingEvent =
  | { readonly type: "AccountingSessionCreated" }
  | {
      readonly amount: number;
      readonly forcedBet: "big-blind" | "small-blind";
      readonly seatId: string;
      readonly type: "ForcedBetPosted";
    }
  | { readonly handId: string; readonly type: "AccountingHandStarted" }
  | {
      readonly action: "all-in" | "bet" | "call" | "check" | "fold" | "raise";
      readonly amount: number;
      readonly seatId: string;
      readonly to?: number;
      readonly type: "BettingActionCommitted";
    }
  | { readonly street: AccountingStreet; readonly type: "BettingRoundClosed" }
  | {
      readonly street: AccountingStreet;
      readonly type: "AccountingStreetStarted";
    }
  | { readonly type: "ShowdownStarted" }
  | { readonly totalPot: number; readonly type: "SettlementProposed" }
  | { readonly totalPot: number; readonly type: "SettlementConfirmed" };

export type AccountingSubmitResult =
  | {
      readonly events: readonly AccountingEvent[];
      readonly state: AccountingState;
      readonly status: "accepted";
    }
  | {
      readonly code: "command-not-allowed" | "invalid-amount";
      readonly status: "rejected";
    };

export type LegalAction =
  | { readonly type: "fold" }
  | { readonly type: "check" }
  | { readonly amount: number; readonly type: "call" }
  | { readonly maxTo: number; readonly minTo: number; readonly type: "bet-to" }
  | {
      readonly maxTo: number;
      readonly minTo: number;
      readonly type: "raise-to";
    }
  | { readonly to: number; readonly type: "all-in" };

export interface AccountingProjection {
  readonly currentActorSeatId?: string;
  readonly currentBet: number;
  readonly dealerSeatId?: string;
  readonly handId?: string;
  readonly phase: AccountingState["phase"];
  readonly potTotal: number;
  readonly pots?: readonly {
    readonly amount: number;
    readonly eligibleSeatIds: readonly string[];
  }[];
  readonly seats: readonly AccountingSeatState[];
  readonly sessionTotal: number;
  readonly settlement?: SettlementProposal;
  readonly street?: AccountingStreet;
}

export interface DigitalAccountingOptions {
  readonly bigBlind: number;
  readonly housePolicyId: string;
  readonly smallBlind: number;
}

export interface DigitalAccounting {
  legalActions(state: AccountingState, seatId: string): readonly LegalAction[];
  project(state: AccountingState): AccountingProjection;
  submit(
    state: AccountingState | undefined,
    command: AccountingCommand,
  ): AccountingSubmitResult;
  validate(state: AccountingState): boolean;
}

function isPositiveChipAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

type MutableAccountingState = {
  -readonly [Key in keyof AccountingState]: AccountingState[Key];
};

function withoutCurrentActor(state: AccountingState): AccountingState {
  const next: MutableAccountingState = { ...state };
  delete next.currentActorSeatId;
  return next;
}

function withoutSettlement(state: AccountingState): AccountingState {
  const next: MutableAccountingState = { ...state };
  delete next.settlement;
  return next;
}

function nextSeatId(
  seatIds: readonly string[],
  seatId: string,
): string | undefined {
  const index = seatIds.indexOf(seatId);
  if (index < 0 || seatIds.length === 0) return undefined;
  return seatIds[(index + 1) % seatIds.length];
}

function derivePots(seats: readonly AccountingSeatState[]): readonly {
  readonly amount: number;
  readonly eligibleSeatIds: readonly string[];
}[] {
  const levels = [
    ...new Set(
      seats
        .map((seat) => seat.totalContribution)
        .filter((amount) => amount > 0),
    ),
  ].sort((left, right) => left - right);
  let previousLevel = 0;
  const pots: {
    amount: number;
    eligibleSeatIds: readonly string[];
  }[] = [];
  for (const level of levels) {
    const amount = seats.reduce(
      (total, seat) =>
        total +
        Math.max(
          0,
          Math.min(seat.totalContribution, level) -
            Math.min(seat.totalContribution, previousLevel),
        ),
      0,
    );
    const eligibleSeatIds = seats
      .filter(
        (seat) => seat.status !== "folded" && seat.totalContribution >= level,
      )
      .map((seat) => seat.seatId);
    previousLevel = level;
    if (amount <= 0 || eligibleSeatIds.length === 0) continue;
    const previous = pots.at(-1);
    if (
      previous &&
      previous.eligibleSeatIds.length === eligibleSeatIds.length &&
      previous.eligibleSeatIds.every(
        (seatId, index) => seatId === eligibleSeatIds[index],
      )
    ) {
      previous.amount += amount;
    } else {
      pots.push({ amount, eligibleSeatIds });
    }
  }
  return pots;
}

function clockwiseWinnerOrder(
  seats: readonly AccountingSeatState[],
  dealerSeatId: string,
  winnerSeatIds: readonly string[],
): readonly string[] {
  const seatIds = seats.map((seat) => seat.seatId);
  const firstSeatId = nextSeatId(seatIds, dealerSeatId);
  const firstIndex = firstSeatId ? seatIds.indexOf(firstSeatId) : 0;
  const clockwise = [
    ...seatIds.slice(Math.max(firstIndex, 0)),
    ...seatIds.slice(0, Math.max(firstIndex, 0)),
  ];
  const winnerSet = new Set(winnerSeatIds);
  return clockwise.filter((seatId) => winnerSet.has(seatId));
}

export function createDigitalAccounting(
  options: DigitalAccountingOptions,
): DigitalAccounting {
  if (
    !isPositiveChipAmount(options.smallBlind) ||
    !isPositiveChipAmount(options.bigBlind) ||
    options.smallBlind >= options.bigBlind ||
    options.housePolicyId.trim().length === 0
  ) {
    throw new Error("The digital accounting policy is invalid.");
  }

  function submit(
    state: AccountingState | undefined,
    command: AccountingCommand,
  ): AccountingSubmitResult {
    if (command.type === "CreateSession") {
      const uniqueSeats = new Set(command.seats.map((seat) => seat.seatId));
      const sessionTotal = command.seats.reduce(
        (total, seat) => total + seat.stack,
        0,
      );
      if (
        state ||
        command.seats.length < 2 ||
        command.seats.length > 10 ||
        uniqueSeats.size !== command.seats.length ||
        command.seats.some(
          (seat) =>
            seat.seatId.trim().length === 0 ||
            !isPositiveChipAmount(seat.stack),
        ) ||
        !isPositiveChipAmount(sessionTotal)
      ) {
        return { code: "command-not-allowed", status: "rejected" };
      }
      return {
        events: [{ type: "AccountingSessionCreated" }],
        state: {
          bigBlind: options.bigBlind,
          currentBet: 0,
          housePolicyId: options.housePolicyId,
          lastFullRaise: options.bigBlind,
          pendingSeatIds: [],
          phase: "between-hands",
          schemaVersion: 2,
          lastActions: [],
          sessionTotal,
          seats: command.seats.map((seat) => ({
            seatId: seat.seatId,
            stack: seat.stack,
            status: "active",
            streetContribution: 0,
            totalContribution: 0,
          })),
          smallBlind: options.smallBlind,
        },
        status: "accepted",
      };
    }

    if (
      command.type === "StartHand" &&
      (!state ||
        !["between-hands", "complete"].includes(state.phase) ||
        command.handId.trim().length === 0)
    ) {
      return { code: "command-not-allowed", status: "rejected" };
    }
    if (command.type === "StartHand") {
      if (!state) return { code: "command-not-allowed", status: "rejected" };
      const activeSeatSet = new Set(command.activeSeatIds);
      const orderedActiveSeats = state.seats.filter((seat) =>
        activeSeatSet.has(seat.seatId),
      );
      if (
        command.activeSeatIds.length < 2 ||
        activeSeatSet.size !== command.activeSeatIds.length ||
        orderedActiveSeats.length !== command.activeSeatIds.length ||
        orderedActiveSeats.some((seat) => seat.stack === 0) ||
        !activeSeatSet.has(command.dealerSeatId)
      ) {
        return { code: "command-not-allowed", status: "rejected" };
      }
      const activeSeatIds = orderedActiveSeats.map((seat) => seat.seatId);
      const smallBlindSeatId =
        activeSeatIds.length === 2
          ? command.dealerSeatId
          : nextSeatId(activeSeatIds, command.dealerSeatId);
      const bigBlindSeatId = smallBlindSeatId
        ? nextSeatId(activeSeatIds, smallBlindSeatId)
        : undefined;
      if (!smallBlindSeatId || !bigBlindSeatId) {
        return { code: "command-not-allowed", status: "rejected" };
      }

      const events: AccountingEvent[] = [];
      const seats = state.seats.map((seat): AccountingSeatState => {
        if (!activeSeatSet.has(seat.seatId)) {
          return {
            ...seat,
            status: "folded",
            streetContribution: 0,
            totalContribution: 0,
          };
        }
        const forcedBet =
          seat.seatId === smallBlindSeatId
            ? options.smallBlind
            : seat.seatId === bigBlindSeatId
              ? options.bigBlind
              : 0;
        const amount = Math.min(seat.stack, forcedBet);
        if (amount > 0) {
          events.push({
            amount,
            forcedBet:
              seat.seatId === smallBlindSeatId ? "small-blind" : "big-blind",
            seatId: seat.seatId,
            type: "ForcedBetPosted",
          });
        }
        return {
          ...seat,
          stack: seat.stack - amount,
          status: seat.stack === amount ? "all-in" : "active",
          streetContribution: amount,
          totalContribution: amount,
        };
      });
      const preflopFirst = nextSeatId(activeSeatIds, bigBlindSeatId);
      const activeCount = seats.filter(
        (seat) => seat.status === "active",
      ).length;
      const currentBet = Math.max(
        activeCount > 1 ? options.bigBlind : 0,
        ...seats.map((seat) => seat.streetContribution),
      );
      const pendingSeatIds = preflopFirst
        ? [
            ...activeSeatIds.slice(activeSeatIds.indexOf(preflopFirst)),
            ...activeSeatIds.slice(0, activeSeatIds.indexOf(preflopFirst)),
          ].filter((seatId) =>
            seats.some(
              (seat) =>
                seat.seatId === seatId &&
                seat.status === "active" &&
                (activeCount > 1 || seat.streetContribution < currentBet),
            ),
          )
        : [];
      events.unshift({ handId: command.handId, type: "AccountingHandStarted" });
      const sessionWithoutSettlement = withoutSettlement(state);
      const hand: AccountingState = {
        ...withoutCurrentActor(sessionWithoutSettlement),
        ...(pendingSeatIds[0] ? { currentActorSeatId: pendingSeatIds[0] } : {}),
        currentBet,
        dealerSeatId: command.dealerSeatId,
        handId: command.handId,
        lastFullRaise: options.bigBlind,
        lastActions: [],
        pendingSeatIds,
        phase: "betting",
        seats,
        street: "preflop",
      };
      return pendingSeatIds.length > 0
        ? { events, state: hand, status: "accepted" }
        : advanceClosedRound(hand, events);
    }

    if (command.type === "ProposeSettlement") {
      if (!state || state.phase !== "showdown" || !state.dealerSeatId) {
        return { code: "command-not-allowed", status: "rejected" };
      }
      const pots = derivePots(state.seats);
      if (
        pots.length === 0 ||
        command.winnersByPot.length !== pots.length ||
        command.explanations.length !== pots.length
      ) {
        return { code: "command-not-allowed", status: "rejected" };
      }
      const settlementPots: SettlementPot[] = [];
      for (const [index, pot] of pots.entries()) {
        const winnerSeatIds = command.winnersByPot[index] ?? [];
        const uniqueWinners = new Set(winnerSeatIds);
        if (
          winnerSeatIds.length === 0 ||
          uniqueWinners.size !== winnerSeatIds.length ||
          winnerSeatIds.some((seatId) => !pot.eligibleSeatIds.includes(seatId))
        ) {
          return { code: "command-not-allowed", status: "rejected" };
        }
        const orderedWinners = clockwiseWinnerOrder(
          state.seats,
          state.dealerSeatId,
          winnerSeatIds,
        );
        const share = Math.floor(pot.amount / orderedWinners.length);
        let remainder = pot.amount % orderedWinners.length;
        const awards = orderedWinners.map((seatId): SettlementAward => {
          const amount = share + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
          return { amount, seatId };
        });
        settlementPots.push({
          amount: pot.amount,
          awards,
          eligibleSeatIds: [...pot.eligibleSeatIds],
          explanation: command.explanations[index] ?? "",
          winnerSeatIds: orderedWinners,
        });
      }
      const settlement: SettlementProposal = {
        pots: settlementPots,
        totalPot: settlementPots.reduce((total, pot) => total + pot.amount, 0),
      };
      return {
        events: [{ totalPot: settlement.totalPot, type: "SettlementProposed" }],
        state: { ...state, phase: "settlement-pending", settlement },
        status: "accepted",
      };
    }

    if (command.type === "ConfirmSettlement") {
      if (!state?.settlement || state.phase !== "settlement-pending") {
        return { code: "command-not-allowed", status: "rejected" };
      }
      const awardsBySeat = new Map<string, number>();
      for (const pot of state.settlement.pots) {
        for (const award of pot.awards) {
          awardsBySeat.set(
            award.seatId,
            (awardsBySeat.get(award.seatId) ?? 0) + award.amount,
          );
        }
      }
      const withoutActor = withoutCurrentActor(state);
      return {
        events: [
          {
            totalPot: state.settlement.totalPot,
            type: "SettlementConfirmed",
          },
        ],
        state: {
          ...withoutActor,
          currentBet: 0,
          pendingSeatIds: [],
          lastActions: [],
          phase: "complete",
          seats: state.seats.map((seat) => {
            const stack = seat.stack + (awardsBySeat.get(seat.seatId) ?? 0);
            return {
              ...seat,
              stack,
              status: stack === 0 ? "all-in" : "active",
              streetContribution: 0,
              totalContribution: 0,
            };
          }),
        },
        status: "accepted",
      };
    }

    if (
      !state ||
      state.phase !== "betting" ||
      !state.street ||
      state.currentActorSeatId !== command.seatId
    ) {
      return { code: "command-not-allowed", status: "rejected" };
    }
    const actingSeat = state.seats.find(
      (seat) => seat.seatId === command.seatId,
    );
    if (!actingSeat || actingSeat.status !== "active") {
      return { code: "command-not-allowed", status: "rejected" };
    }
    const toCall = Math.max(
      0,
      state.currentBet - actingSeat.streetContribution,
    );
    const raiseEnvelope = legalActions(state, command.seatId).find(
      (
        action,
      ): action is Extract<
        LegalAction,
        { readonly type: "bet-to" | "raise-to" }
      > => action.type === "bet-to" || action.type === "raise-to",
    );
    const allInEnvelope = legalActions(state, command.seatId).find(
      (action): action is Extract<LegalAction, { readonly type: "all-in" }> =>
        action.type === "all-in",
    );
    if (
      (command.type === "Call" && toCall === 0) ||
      (command.type === "Check" && toCall !== 0) ||
      (command.type === "BetOrRaiseTo" &&
        (!raiseEnvelope ||
          !Number.isSafeInteger(command.to) ||
          command.to < raiseEnvelope.minTo ||
          command.to > raiseEnvelope.maxTo)) ||
      (command.type === "AllIn" && !allInEnvelope)
    ) {
      return { code: "command-not-allowed", status: "rejected" };
    }
    const amount =
      command.type === "Call"
        ? Math.min(toCall, actingSeat.stack)
        : command.type === "BetOrRaiseTo"
          ? command.to - actingSeat.streetContribution
          : command.type === "AllIn"
            ? actingSeat.stack
            : 0;
    const seats = state.seats.map((seat): AccountingSeatState => {
      if (seat.seatId !== command.seatId) return seat;
      if (command.type === "Fold") return { ...seat, status: "folded" };
      const stack = seat.stack - amount;
      return {
        ...seat,
        stack,
        status: stack === 0 ? "all-in" : "active",
        streetContribution: seat.streetContribution + amount,
        totalContribution: seat.totalContribution + amount,
      };
    });
    const aggressiveTo =
      command.type === "BetOrRaiseTo"
        ? command.to
        : command.type === "AllIn"
          ? actingSeat.streetContribution + actingSeat.stack
          : undefined;
    const activeCount = seats.filter((seat) => seat.status === "active").length;
    const currentBet = Math.max(
      state.street === "preflop" && activeCount > 1 ? state.bigBlind : 0,
      ...seats.map((seat) => seat.streetContribution),
    );
    const lastActions = [
      ...state.lastActions.filter((entry) => entry.seatId !== command.seatId),
      {
        seatId: command.seatId,
        bet: Math.max(state.currentBet, aggressiveTo ?? 0),
      },
    ];
    const pendingSeatIds = (
      aggressiveTo !== undefined && aggressiveTo > state.currentBet
        ? (() => {
            const seatIds = seats.map((seat) => seat.seatId);
            const firstSeatId = nextSeatId(seatIds, command.seatId);
            const firstIndex = firstSeatId ? seatIds.indexOf(firstSeatId) : 0;
            return [
              ...seatIds.slice(Math.max(firstIndex, 0)),
              ...seatIds.slice(0, Math.max(firstIndex, 0)),
            ].filter(
              (seatId) =>
                seatId !== command.seatId &&
                seats.find((seat) => seat.seatId === seatId)?.status ===
                  "active",
            );
          })()
        : state.pendingSeatIds.filter((seatId) => seatId !== command.seatId)
    ).filter((seatId) => {
      const seat = seats.find((candidate) => candidate.seatId === seatId);
      return (
        activeCount > 1 ||
        (seat !== undefined && seat.streetContribution < currentBet)
      );
    });
    const action =
      command.type === "Call"
        ? "call"
        : command.type === "Check"
          ? "check"
          : command.type === "Fold"
            ? "fold"
            : command.type === "AllIn"
              ? "all-in"
              : state.currentBet === 0
                ? "bet"
                : "raise";
    const events: AccountingEvent[] = [
      {
        action,
        amount,
        seatId: command.seatId,
        ...(aggressiveTo !== undefined ? { to: aggressiveTo } : {}),
        type: "BettingActionCommitted",
      },
    ];
    if (seats.filter((seat) => seat.status !== "folded").length === 1) {
      events.push({ type: "ShowdownStarted" });
      const withoutActor = withoutCurrentActor(state);
      return {
        events,
        state: {
          ...withoutActor,
          pendingSeatIds: [],
          phase: "showdown",
          seats,
        },
        status: "accepted",
      };
    }
    if (pendingSeatIds.length > 0) {
      return {
        events,
        state: {
          ...state,
          ...(pendingSeatIds[0]
            ? { currentActorSeatId: pendingSeatIds[0] }
            : {}),
          currentBet,
          lastFullRaise:
            aggressiveTo !== undefined &&
            aggressiveTo - state.currentBet >= state.lastFullRaise
              ? aggressiveTo - state.currentBet
              : state.lastFullRaise,
          pendingSeatIds,
          lastActions,
          seats,
        },
        status: "accepted",
      };
    }

    return advanceClosedRound(
      { ...withoutCurrentActor(state), seats, pendingSeatIds: [], lastActions },
      events,
    );
  }

  function advanceClosedRound(
    state: AccountingState,
    events: AccountingEvent[],
  ): AccountingSubmitResult {
    const seats = state.seats;
    const nextStreet: Partial<Record<AccountingStreet, AccountingStreet>> = {
      flop: "turn",
      preflop: "flop",
      turn: "river",
    };
    if (!state.street)
      return { code: "command-not-allowed", status: "rejected" };
    const street = nextStreet[state.street];
    if (!state.dealerSeatId) {
      return { code: "command-not-allowed", status: "rejected" };
    }
    if (!street) {
      events.push(
        { street: state.street, type: "BettingRoundClosed" },
        { type: "ShowdownStarted" },
      );
      const withoutActor = withoutCurrentActor(state);
      return {
        events,
        state: {
          ...withoutActor,
          pendingSeatIds: [],
          lastActions: [],
          phase: "showdown",
          seats,
        },
        status: "accepted",
      };
    }
    const activeSeatIds = seats
      .filter((seat) => seat.status === "active")
      .map((seat) => seat.seatId);
    if (activeSeatIds.length <= 1) {
      let runoutStreet = state.street;
      while (true) {
        events.push({
          street: runoutStreet,
          type: "BettingRoundClosed",
        });
        const followingStreet = nextStreet[runoutStreet];
        if (!followingStreet) break;
        events.push({
          street: followingStreet,
          type: "AccountingStreetStarted",
        });
        runoutStreet = followingStreet;
      }
      events.push({ type: "ShowdownStarted" });
      const withoutActor = withoutCurrentActor(state);
      return {
        events,
        state: {
          ...withoutActor,
          currentBet: 0,
          lastFullRaise: state.bigBlind,
          pendingSeatIds: [],
          lastActions: [],
          phase: "showdown",
          seats: seats.map((seat) => ({ ...seat, streetContribution: 0 })),
          street: runoutStreet,
        },
        status: "accepted",
      };
    }
    // Rotate the physical seating order before removing folded/all-in seats.
    const dealerIndex = seats.findIndex(
      (seat) => seat.seatId === state.dealerSeatId,
    );
    const nextPendingSeatIds = [
      ...seats.slice(dealerIndex + 1),
      ...seats.slice(0, dealerIndex + 1),
    ]
      .filter((seat) => seat.status === "active")
      .map((seat) => seat.seatId);
    events.push(
      { street: state.street, type: "BettingRoundClosed" },
      { street, type: "AccountingStreetStarted" },
    );
    return {
      events,
      state: {
        ...state,
        ...(nextPendingSeatIds[0]
          ? { currentActorSeatId: nextPendingSeatIds[0] }
          : {}),
        currentBet: 0,
        lastFullRaise: state.bigBlind,
        pendingSeatIds: nextPendingSeatIds,
        lastActions: [],
        seats: seats.map((seat) => ({ ...seat, streetContribution: 0 })),
        street,
      },
      status: "accepted",
    };
  }

  function legalActions(
    state: AccountingState,
    seatId: string,
  ): readonly LegalAction[] {
    if (state.phase !== "betting" || state.currentActorSeatId !== seatId) {
      return [];
    }
    const seat = state.seats.find((candidate) => candidate.seatId === seatId);
    if (!seat || seat.status !== "active") return [];
    const toCall = Math.max(0, state.currentBet - seat.streetContribution);
    const maxTo = seat.streetContribution + seat.stack;
    const actions: LegalAction[] = [{ type: "fold" }];
    if (toCall === 0) actions.push({ type: "check" });
    else actions.push({ amount: Math.min(toCall, seat.stack), type: "call" });
    const hasRespondingOpponent = state.seats.some(
      (opponent) => opponent.seatId !== seatId && opponent.status === "active",
    );
    const lastAction = state.lastActions.find(
      (entry) => entry.seatId === seatId,
    );
    const canRaise =
      lastAction === undefined ||
      state.currentBet - lastAction.bet >= state.lastFullRaise;
    if (maxTo > state.currentBet && hasRespondingOpponent && canRaise) {
      const minTo =
        state.currentBet === 0
          ? state.bigBlind
          : state.currentBet + state.lastFullRaise;
      if (maxTo >= minTo) {
        actions.push({
          maxTo,
          minTo,
          type: state.currentBet === 0 ? "bet-to" : "raise-to",
        });
      }
      actions.push({ to: maxTo, type: "all-in" });
    }
    return actions;
  }

  function project(state: AccountingState): AccountingProjection {
    const pots = state.phase === "showdown" ? derivePots(state.seats) : [];
    return {
      ...(state.currentActorSeatId
        ? { currentActorSeatId: state.currentActorSeatId }
        : {}),
      currentBet: state.currentBet,
      ...(state.dealerSeatId ? { dealerSeatId: state.dealerSeatId } : {}),
      ...(state.handId ? { handId: state.handId } : {}),
      phase: state.phase,
      potTotal: state.seats.reduce(
        (total, seat) => total + seat.totalContribution,
        0,
      ),
      ...(pots.length > 0 ? { pots: structuredClone(pots) } : {}),
      seats: structuredClone(state.seats),
      sessionTotal: state.sessionTotal,
      ...(state.settlement
        ? { settlement: structuredClone(state.settlement) }
        : {}),
      ...(state.street ? { street: state.street } : {}),
    };
  }

  function validate(state: AccountingState): boolean {
    try {
      const validPhases: readonly AccountingState["phase"][] = [
        "between-hands",
        "betting",
        "showdown",
        "settlement-pending",
        "complete",
      ];
      const validStatuses: readonly AccountingSeatStatus[] = [
        "active",
        "all-in",
        "folded",
      ];
      const validStreets: readonly AccountingStreet[] = [
        "preflop",
        "flop",
        "turn",
        "river",
      ];
      if (
        state.schemaVersion !== 2 ||
        !Array.isArray(state.lastActions) ||
        state.bigBlind !== options.bigBlind ||
        state.smallBlind !== options.smallBlind ||
        state.housePolicyId !== options.housePolicyId ||
        !isPositiveChipAmount(state.sessionTotal) ||
        !validPhases.includes(state.phase) ||
        !Number.isSafeInteger(state.currentBet) ||
        state.currentBet < 0 ||
        !isPositiveChipAmount(state.lastFullRaise) ||
        !Array.isArray(state.seats) ||
        state.seats.length < 2 ||
        state.seats.length > 10 ||
        !Array.isArray(state.pendingSeatIds)
      ) {
        return false;
      }
      const seatIds = state.seats.map((seat) => seat.seatId);
      const seatIdSet = new Set(seatIds);
      if (
        new Set(state.lastActions.map((entry) => entry.seatId)).size !==
          state.lastActions.length ||
        state.lastActions.some(
          (entry) =>
            !seatIdSet.has(entry.seatId) ||
            !Number.isSafeInteger(entry.bet) ||
            entry.bet < 0 ||
            (state.phase === "betting" && entry.bet > state.currentBet),
        ) ||
        seatIdSet.size !== seatIds.length ||
        seatIds.some(
          (seatId) => typeof seatId !== "string" || !seatId.trim(),
        ) ||
        state.seats.some(
          (seat) =>
            !validStatuses.includes(seat.status) ||
            !Number.isSafeInteger(seat.stack) ||
            seat.stack < 0 ||
            !Number.isSafeInteger(seat.streetContribution) ||
            seat.streetContribution < 0 ||
            !Number.isSafeInteger(seat.totalContribution) ||
            seat.totalContribution < seat.streetContribution ||
            (seat.status === "all-in" && seat.stack !== 0) ||
            (seat.status === "active" && seat.stack === 0),
        )
      ) {
        return false;
      }
      const pendingSeatSet = new Set(state.pendingSeatIds);
      if (
        pendingSeatSet.size !== state.pendingSeatIds.length ||
        state.pendingSeatIds.some(
          (seatId) =>
            !seatIdSet.has(seatId) ||
            state.seats.find((seat) => seat.seatId === seatId)?.status !==
              "active",
        ) ||
        (state.dealerSeatId !== undefined &&
          !seatIdSet.has(state.dealerSeatId)) ||
        (state.street !== undefined && !validStreets.includes(state.street))
      ) {
        return false;
      }

      const contributionTotal = state.seats.reduce(
        (total, seat) => total + seat.totalContribution,
        0,
      );
      const stackTotal = state.seats.reduce(
        (total, seat) => total + seat.stack,
        0,
      );
      if (
        !Number.isSafeInteger(contributionTotal) ||
        !Number.isSafeInteger(stackTotal) ||
        stackTotal + contributionTotal !== state.sessionTotal
      ) {
        return false;
      }

      if (state.phase === "between-hands") {
        return (
          state.currentActorSeatId === undefined &&
          state.currentBet === 0 &&
          state.pendingSeatIds.length === 0 &&
          state.settlement === undefined &&
          contributionTotal === 0
        );
      }

      if (
        typeof state.handId !== "string" ||
        !state.handId.trim() ||
        state.dealerSeatId === undefined ||
        state.street === undefined
      ) {
        return false;
      }

      if (state.phase === "betting") {
        return (
          state.settlement === undefined &&
          state.pendingSeatIds.length > 0 &&
          state.currentActorSeatId === state.pendingSeatIds[0] &&
          state.currentBet ===
            Math.max(
              state.street === "preflop" &&
                state.seats.filter((seat) => seat.status === "active").length >
                  1
                ? state.bigBlind
                : 0,
              ...state.seats.map((seat) => seat.streetContribution),
            )
        );
      }

      if (
        state.currentActorSeatId !== undefined ||
        state.pendingSeatIds.length !== 0
      ) {
        return false;
      }
      if (state.phase === "showdown") {
        const derivedTotal = derivePots(state.seats).reduce(
          (total, pot) => total + pot.amount,
          0,
        );
        return (
          state.settlement === undefined && derivedTotal === contributionTotal
        );
      }

      const settlement = state.settlement;
      if (
        !settlement ||
        !Number.isSafeInteger(settlement.totalPot) ||
        settlement.totalPot <= 0 ||
        !Array.isArray(settlement.pots) ||
        settlement.pots.length === 0
      ) {
        return false;
      }
      let settlementTotal = 0;
      for (const pot of settlement.pots as readonly SettlementPot[]) {
        const eligibleSeatIds = new Set(pot.eligibleSeatIds);
        const winnerSeatIds = new Set(pot.winnerSeatIds);
        const awardSeatIds = new Set(pot.awards.map((award) => award.seatId));
        const awardTotal = pot.awards.reduce(
          (total, award) => total + award.amount,
          0,
        );
        if (
          !isPositiveChipAmount(pot.amount) ||
          typeof pot.explanation !== "string" ||
          !pot.explanation.trim() ||
          eligibleSeatIds.size !== pot.eligibleSeatIds.length ||
          eligibleSeatIds.size === 0 ||
          [...eligibleSeatIds].some((seatId) => !seatIdSet.has(seatId)) ||
          winnerSeatIds.size !== pot.winnerSeatIds.length ||
          winnerSeatIds.size === 0 ||
          [...winnerSeatIds].some((seatId) => !eligibleSeatIds.has(seatId)) ||
          awardSeatIds.size !== pot.awards.length ||
          awardSeatIds.size !== winnerSeatIds.size ||
          [...awardSeatIds].some((seatId) => !winnerSeatIds.has(seatId)) ||
          pot.awards.some((award) => !isPositiveChipAmount(award.amount)) ||
          awardTotal !== pot.amount
        ) {
          return false;
        }
        settlementTotal += pot.amount;
      }
      if (
        !Number.isSafeInteger(settlementTotal) ||
        settlementTotal !== settlement.totalPot
      ) {
        return false;
      }
      return state.phase === "settlement-pending"
        ? contributionTotal === settlement.totalPot
        : state.phase === "complete" &&
            state.currentBet === 0 &&
            contributionTotal === 0;
    } catch {
      return false;
    }
  }

  return { legalActions, project, submit, validate };
}
