import type {
  Card,
  CardCustody,
  CustodyState,
  Rank,
  Street,
} from "@html-poker/card-custody";
import {
  createDigitalAccounting,
  type AccountingCommand,
  type AccountingProjection,
  type AccountingState,
  type DigitalAccounting,
  type LegalAction,
} from "@html-poker/accounting";
import type { AtomicTableStore, CommitResult } from "@html-poker/persistence";

export interface SeatDefinition {
  readonly displayName: string;
  readonly seatId: string;
}

type HostActor = { readonly actorId: string; readonly kind: "trusted-host" };
type SeatActor = { readonly kind: "seat"; readonly seatId: string };
export type Actor = HostActor | SeatActor;

export interface DealOnlyRulesProfile {
  readonly id: "deal-only-v1";
}

export interface DigitalRulesProfile {
  readonly bigBlind: number;
  readonly housePolicyId: "p2-house-1";
  readonly id: "nlhe-home-v1";
  readonly smallBlind: number;
  readonly startingStack: number;
}

export type RulesProfile = DealOnlyRulesProfile | DigitalRulesProfile;

export type TableTheme = "dark-green" | "black-gold" | "deep-navy";

export function isTableTheme(value: unknown): value is TableTheme {
  return ["dark-green", "black-gold", "deep-navy"].includes(String(value));
}

/** A built-in deck presentation, deliberately separate from the deferred
 * community-skin package protocol. */
export type CardStyle = "classic" | "four-colour";

export function isCardStyle(value: unknown): value is CardStyle {
  return ["classic", "four-colour"].includes(String(value));
}

export type BettingActionIntent =
  | { readonly type: "all-in" | "call" | "check" | "fold" }
  | { readonly to: number; readonly type: "bet-or-raise-to" };

export function isBettingActionIntent(
  value: unknown,
): value is BettingActionIntent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { readonly to?: unknown; readonly type?: unknown };
  return ["all-in", "call", "check", "fold"].includes(String(candidate.type))
    ? true
    : candidate.type === "bet-or-raise-to" &&
        Number.isSafeInteger(candidate.to) &&
        Number(candidate.to) > 0;
}

export function isRulesProfile(value: unknown): value is RulesProfile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    readonly bigBlind?: unknown;
    readonly housePolicyId?: unknown;
    readonly id?: unknown;
    readonly smallBlind?: unknown;
    readonly startingStack?: unknown;
  };
  if (candidate.id === "deal-only-v1") {
    return Object.keys(value).length === 1;
  }
  return (
    candidate.id === "nlhe-home-v1" &&
    candidate.housePolicyId === "p2-house-1" &&
    typeof candidate.startingStack === "number" &&
    Number.isSafeInteger(candidate.startingStack) &&
    typeof candidate.smallBlind === "number" &&
    typeof candidate.bigBlind === "number" &&
    candidate.startingStack > candidate.bigBlind &&
    Number.isSafeInteger(candidate.smallBlind) &&
    candidate.smallBlind > 0 &&
    Number.isSafeInteger(candidate.bigBlind) &&
    candidate.bigBlind > candidate.smallBlind
  );
}

export type CommandPayload =
  | {
      readonly dealerSeatId: string;
      readonly rulesProfile?: RulesProfile;
      readonly seats: readonly SeatDefinition[];
      readonly type: "CreateTable";
    }
  | { readonly type: "StartHand" }
  | { readonly street: Street; readonly type: "RevealStreet" }
  | { readonly type: "FoldCards" }
  | { readonly type: "RetractFold" }
  | { readonly type: "FinalizeFold" }
  | { readonly type: "ShowCards" }
  /** Legacy recovery compatibility. Current player interfaces emit FoldCards instead. */
  | { readonly type: "MuckCards" }
  | { readonly type: "EndHand" }
  | { readonly dealerSeatId: string; readonly type: "RelocateDealer" }
  | { readonly reason: string; readonly type: "VoidHand" }
  | { readonly seat: SeatDefinition; readonly type: "RegisterSeat" }
  | { readonly seatId: string; readonly type: "UnregisterSeat" }
  | {
      readonly seatId: string;
      readonly sittingOut: boolean;
      readonly type: "SetSeatParticipation";
    }
  | {
      readonly correctedEventIds: readonly string[];
      readonly reason: string;
      readonly type: "RecordCorrection";
    }
  | {
      readonly action: BettingActionIntent;
      readonly type: "SubmitBettingAction";
    }
  | { readonly type: "PrepareSettlement" }
  | { readonly type: "ConfirmSettlement" }
  | { readonly tableTheme: TableTheme; readonly type: "SetTableTheme" }
  | { readonly cardStyle: CardStyle; readonly type: "SetCardStyle" };

export interface CommandEnvelope {
  readonly actor: Actor;
  readonly authorityEpoch: string;
  readonly commandId: string;
  readonly expectedRevision: number;
  readonly handId?: string;
  readonly payload: CommandPayload;
  readonly tableId: string;
}

export type RejectionCode =
  | "authority-mismatch"
  | "command-not-allowed"
  | "hand-mismatch"
  | "idempotency-conflict"
  | "persistence-failed"
  | "revision-conflict"
  | "table-mismatch";

export type EventType =
  | "TableCreated"
  | "HandStarted"
  | "StreetRevealed"
  | "FoldStarted"
  | "FoldRetracted"
  | "FoldFinalized"
  | "CardsShown"
  | "CardsMucked"
  | "HandEnded"
  | "DealerRelocated"
  | "HandVoided"
  | "CorrectionRecorded"
  | "SeatRegistered"
  | "SeatUnregistered"
  | "SeatParticipationChanged"
  | "AccountingSessionCreated"
  | "AccountingHandStarted"
  | "ForcedBetPosted"
  | "BettingActionCommitted"
  | "BettingRoundClosed"
  | "AccountingStreetStarted"
  | "ShowdownStarted"
  | "SettlementProposed"
  | "SettlementConfirmed"
  | "TableThemeChanged"
  | "CardStyleChanged";

export interface EventSummary {
  readonly type: EventType;
}

export interface TableEvent extends EventSummary {
  readonly commandId: string;
  readonly correctedEventIds?: readonly string[];
  readonly dealerSeatId?: string;
  readonly eventId: string;
  readonly handId?: string;
  readonly reason?: string;
  readonly revision: number;
  readonly seatId?: string;
  readonly sittingOut?: boolean;
}

export interface AcceptedReceipt {
  readonly events: readonly EventSummary[];
  readonly handId?: string;
  readonly revision: number;
  readonly status: "accepted";
}

export interface RejectedReceipt {
  readonly code: RejectionCode;
  readonly revision: number;
  readonly status: "rejected";
}

export type CommandReceipt = AcceptedReceipt | RejectedReceipt;
export type HandPhase =
  | "lobby"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "settlement-pending"
  | "complete";

export type SeatHandStatus =
  | "active"
  | "waiting"
  | "sitting-out"
  | "folded-provisional"
  | "folded"
  | "shown"
  | "mucked";

interface SeatState extends SeatDefinition {
  readonly sittingOutNextHand: boolean;
  readonly status: SeatHandStatus;
}

interface AcceptedCommand {
  readonly fingerprint: string;
  readonly receipt: AcceptedReceipt;
}

export interface PersistedAuthorityState {
  readonly accounting?: AccountingState;
  readonly acceptedCommands: Readonly<Record<string, AcceptedCommand>>;
  readonly authorityEpoch: string;
  readonly cardStyle?: CardStyle;
  readonly custody?: CustodyState;
  readonly dealerSeatId: string;
  readonly handId?: string;
  readonly history: readonly TableEvent[];
  readonly phase: HandPhase;
  readonly revision: number;
  readonly rulesProfile?: RulesProfile;
  readonly schemaVersion: 1;
  readonly seats: readonly SeatState[];
  readonly tableTheme?: TableTheme;
  readonly tableId: string;
}

export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-of-a-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-of-a-kind"
  | "straight-flush";

export interface HandEvaluation {
  readonly bestFive: readonly Card[];
  readonly category: HandCategory;
  readonly label: string;
  readonly score: readonly number[];
}

export interface ProjectedSeat {
  readonly connected?: boolean;
  readonly displayName: string;
  /** Presentation-only physical seat number injected by the Trusted Host. */
  readonly displayPosition?: number;
  readonly evaluation?: HandEvaluation;
  readonly holeCards?: readonly Card[];
  readonly seatId: string;
  readonly status: SeatHandStatus;
}

export interface ShowdownProjection {
  readonly evaluatedSeatIds: readonly string[];
  readonly leaders: readonly string[];
  readonly status: "partial" | "complete";
}

export interface PublicProjection {
  readonly accounting?: AccountingProjection;
  readonly board: readonly Card[];
  readonly cardStyle: CardStyle;
  readonly dealerSeatId: string;
  readonly handId?: string;
  readonly phase: HandPhase;
  readonly revision: number;
  readonly rulesProfileId: RulesProfile["id"];
  readonly seats: readonly ProjectedSeat[];
  readonly showdown?: ShowdownProjection;
  readonly tableTheme: TableTheme;
  readonly tableId: string;
  readonly view: "public";
}

export interface SeatProjection extends Omit<PublicProjection, "view"> {
  readonly self: {
    readonly holeCards: readonly Card[];
    readonly legalActions?: readonly LegalAction[];
    readonly seatId: string;
    readonly status: SeatHandStatus;
  };
  readonly view: "seat";
}

export type ProjectionTarget =
  | { readonly kind: "public" }
  | { readonly kind: "seat"; readonly seatId: string };

export interface TrustedHostAuthority {
  history(): readonly TableEvent[];
  project(target: ProjectionTarget): PublicProjection | SeatProjection;
  recover(): Promise<RecoveryResult>;
  submit(command: CommandEnvelope): Promise<CommandReceipt>;
}

export type RecoveryResult =
  | { readonly status: "empty" }
  | { readonly revision: number; readonly status: "recovered" }
  | {
      readonly code: "already-active" | "corrupt-state";
      readonly status: "rejected";
    };

export interface TrustedHostAuthorityOptions {
  readonly authorityEpoch: string;
  readonly custody: CardCustody;
  readonly handIdFactory: () => string;
  readonly store: AtomicTableStore<PersistedAuthorityState>;
  readonly tableId: string;
}

const rankValue: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  A: 14,
  J: 11,
  K: 13,
  Q: 12,
  T: 10,
};

const categoryDetails: ReadonlyArray<
  readonly [category: HandCategory, label: string]
> = [
  ["high-card", "High card"],
  ["pair", "One pair"],
  ["two-pair", "Two pair"],
  ["three-of-a-kind", "Three of a kind"],
  ["straight", "Straight"],
  ["flush", "Flush"],
  ["full-house", "Full house"],
  ["four-of-a-kind", "Four of a kind"],
  ["straight-flush", "Straight flush"],
];

const defaultTableTheme: TableTheme = "dark-green";
const defaultCardStyle: CardStyle = "classic";

function tableThemeOf(state: PersistedAuthorityState): TableTheme {
  return isTableTheme(state.tableTheme) ? state.tableTheme : defaultTableTheme;
}

function cardStyleOf(state: PersistedAuthorityState): CardStyle {
  return isCardStyle(state.cardStyle) ? state.cardStyle : defaultCardStyle;
}

function isHost(actor: Actor): actor is HostActor {
  return actor.kind === "trusted-host";
}

function rejected(code: RejectionCode, revision: number): RejectedReceipt {
  return { code, revision, status: "rejected" };
}

function expectedStreet(phase: HandPhase): Street | undefined {
  if (phase === "preflop") return "flop";
  if (phase === "flop") return "turn";
  if (phase === "turn") return "river";
  return undefined;
}

const dealOnlyRulesProfile: DealOnlyRulesProfile = { id: "deal-only-v1" };

function rulesProfileOf(state: PersistedAuthorityState): RulesProfile {
  return state.rulesProfile ?? dealOnlyRulesProfile;
}

function accountingFor(profile: RulesProfile): DigitalAccounting | undefined {
  if (profile.id !== "nlhe-home-v1") return undefined;
  return createDigitalAccounting({
    bigBlind: profile.bigBlind,
    housePolicyId: profile.housePolicyId,
    smallBlind: profile.smallBlind,
  });
}

function eligibleDealerSeatId(
  state: PersistedAuthorityState,
  playingSeats: readonly SeatState[],
): string {
  if (playingSeats.some((seat) => seat.seatId === state.dealerSeatId)) {
    return state.dealerSeatId;
  }

  const eligibleSeatIds = new Set(playingSeats.map((seat) => seat.seatId));
  const formerDealerIndex = state.seats.findIndex(
    (seat) => seat.seatId === state.dealerSeatId,
  );
  const firstCandidateIndex =
    formerDealerIndex < 0 ? 0 : (formerDealerIndex + 1) % state.seats.length;
  for (let offset = 0; offset < state.seats.length; offset += 1) {
    const candidate =
      state.seats[(firstCandidateIndex + offset) % state.seats.length];
    if (candidate && eligibleSeatIds.has(candidate.seatId)) {
      return candidate.seatId;
    }
  }

  // StartHand already rejects fewer than two eligible seats. This return keeps
  // the reducer total if a corrupted historical state reaches it.
  return playingSeats[0]!.seatId;
}

function toAccountingCommand(
  action: BettingActionIntent,
  seatId: string,
): AccountingCommand | undefined {
  if (!isBettingActionIntent(action)) return undefined;
  switch (action.type) {
    case "all-in":
      return { seatId, type: "AllIn" };
    case "bet-or-raise-to":
      return { seatId, to: action.to, type: "BetOrRaiseTo" };
    case "call":
      return { seatId, type: "Call" };
    case "check":
      return { seatId, type: "Check" };
    case "fold":
      return { seatId, type: "Fold" };
  }
}

function commandFingerprint(command: CommandEnvelope): string {
  return JSON.stringify({
    actor: command.actor,
    handId: command.handId ?? null,
    payload: command.payload,
  });
}

function compareScores(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function fiveCardScore(cards: readonly Card[]): readonly number[] {
  const values = cards.map((card) => rankValue[card[0] as Rank]);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    ([leftValue, leftCount], [rightValue, rightCount]) =>
      rightCount - leftCount || rightValue - leftValue,
  );
  const uniqueDescending = [...counts.keys()].sort((a, b) => b - a);
  const straightValues = uniqueDescending.includes(14)
    ? [...uniqueDescending, 1]
    : uniqueDescending;
  let straightHigh = 0;
  for (let index = 0; index <= straightValues.length - 5; index += 1) {
    const window = straightValues.slice(index, index + 5);
    const high = window[0] ?? 0;
    if (window.every((value, offset) => value === high - offset)) {
      straightHigh = high;
      break;
    }
  }
  const flush = new Set(cards.map((card) => card[1])).size === 1;
  if (flush && straightHigh) return [8, straightHigh];

  const four = groups.find(([, count]) => count === 4);
  if (four) {
    const fourValue = four[0];
    return [7, fourValue, ...uniqueDescending.filter((v) => v !== fourValue)];
  }
  const three = groups.find(([, count]) => count === 3);
  const pair = groups.find(([, count]) => count === 2);
  if (three && pair) return [6, three[0], pair[0]];
  if (flush) return [5, ...uniqueDescending];
  if (straightHigh) return [4, straightHigh];
  if (three) {
    return [
      3,
      three[0],
      ...uniqueDescending.filter((value) => value !== three[0]),
    ];
  }
  const pairs = groups
    .filter(([, count]) => count === 2)
    .map(([value]) => value)
    .sort((a, b) => b - a);
  if (pairs.length >= 2) {
    const highPair = pairs[0] ?? 0;
    const lowPair = pairs[1] ?? 0;
    const kicker = uniqueDescending.find(
      (value) => value !== highPair && value !== lowPair,
    );
    return [2, highPair, lowPair, kicker ?? 0];
  }
  if (pair) {
    return [
      1,
      pair[0],
      ...uniqueDescending.filter((value) => value !== pair[0]),
    ];
  }
  return [0, ...uniqueDescending];
}

function combinations<T>(values: readonly T[], count: number): readonly T[][] {
  const output: T[][] = [];
  function visit(start: number, selected: T[]): void {
    if (selected.length === count) {
      output.push([...selected]);
      return;
    }
    for (
      let index = start;
      index <= values.length - (count - selected.length);
      index += 1
    ) {
      const value = values[index];
      if (value === undefined) continue;
      selected.push(value);
      visit(index + 1, selected);
      selected.pop();
    }
  }
  visit(0, []);
  return output;
}

export function evaluateTexasHoldem(
  cards: readonly Card[],
): HandEvaluation | undefined {
  if (cards.length < 5 || cards.length > 7) return undefined;
  let best: readonly number[] | undefined;
  let bestFive: readonly Card[] | undefined;
  for (const candidate of combinations(cards, 5)) {
    const score = fiveCardScore(candidate);
    if (!best || compareScores(score, best) > 0) {
      best = score;
      bestFive = candidate;
    }
  }
  if (!best || !bestFive) return undefined;
  const details = categoryDetails[best[0] ?? 0] ?? categoryDetails[0];
  if (!details) return undefined;
  return {
    bestFive: [...bestFive],
    category: details[0],
    label: details[1],
    score: [...best],
  };
}

function finalizeProvisionalSeats(seats: readonly SeatState[]): {
  readonly changed: boolean;
  readonly seats: readonly SeatState[];
} {
  let changed = false;
  const finalized = seats.map((seat) => {
    if (seat.status !== "folded-provisional") return seat;
    changed = true;
    return { ...seat, status: "folded" as const };
  });
  return { changed, seats: finalized };
}

function appendHistory(
  state: PersistedAuthorityState,
  command: CommandEnvelope,
  eventSummaries: readonly EventSummary[],
): PersistedAuthorityState {
  const entries = eventSummaries.map((event, index): TableEvent => {
    const correctionDetails =
      command.payload.type === "RecordCorrection" &&
      event.type === "CorrectionRecorded"
        ? {
            correctedEventIds: [...command.payload.correctedEventIds],
            reason: command.payload.reason.trim(),
          }
        : {};
    const relocationDetails =
      command.payload.type === "RelocateDealer" &&
      event.type === "DealerRelocated"
        ? { dealerSeatId: command.payload.dealerSeatId }
        : {};
    const voidDetails =
      command.payload.type === "VoidHand" && event.type === "HandVoided"
        ? { reason: command.payload.reason.trim() }
        : {};
    const seatDetails =
      command.payload.type === "RegisterSeat" && event.type === "SeatRegistered"
        ? { seatId: command.payload.seat.seatId }
        : command.payload.type === "UnregisterSeat" &&
            event.type === "SeatUnregistered"
          ? { seatId: command.payload.seatId }
          : command.payload.type === "SetSeatParticipation" &&
              event.type === "SeatParticipationChanged"
            ? {
                seatId: command.payload.seatId,
                sittingOut: command.payload.sittingOut,
              }
            : {};
    return {
      commandId: command.commandId,
      ...correctionDetails,
      ...relocationDetails,
      eventId: `${command.commandId}:${state.revision}:${index}`,
      ...(state.handId ? { handId: state.handId } : {}),
      revision: state.revision,
      ...seatDetails,
      type: event.type,
      ...voidDetails,
    };
  });
  return { ...state, history: [...state.history, ...entries] };
}

export function createTrustedHostAuthority(
  options: TrustedHostAuthorityOptions,
): TrustedHostAuthority {
  let current: PersistedAuthorityState | undefined;

  function history(): readonly TableEvent[] {
    return current ? structuredClone(current.history) : [];
  }

  async function recover(): Promise<RecoveryResult> {
    if (current) return { code: "already-active", status: "rejected" };
    let loaded;
    try {
      loaded = await options.store.load();
    } catch {
      return { code: "corrupt-state", status: "rejected" };
    }
    if (!loaded) return { status: "empty" };
    const state = loaded.state;
    const profile = rulesProfileOf(state);
    let accountingMatchesProfile = false;
    if (isRulesProfile(profile)) {
      if (profile.id === "deal-only-v1") {
        accountingMatchesProfile = state.accounting === undefined;
      } else if (state.accounting) {
        accountingMatchesProfile =
          accountingFor(profile)?.validate(state.accounting) ?? false;
      }
    }
    const valid =
      loaded.revision === state.revision &&
      state.schemaVersion === 1 &&
      state.tableId === options.tableId &&
      state.authorityEpoch === options.authorityEpoch &&
      (state.tableTheme === undefined || isTableTheme(state.tableTheme)) &&
      (state.cardStyle === undefined || isCardStyle(state.cardStyle)) &&
      accountingMatchesProfile &&
      state.seats.length <= 10 &&
      state.history.every(
        (event) => event.revision >= 1 && event.revision <= state.revision,
      ) &&
      Object.values(state.acceptedCommands).every(
        (command) => command.receipt.revision <= state.revision,
      );
    if (!valid) return { code: "corrupt-state", status: "rejected" };
    current = structuredClone(state);
    return { revision: state.revision, status: "recovered" };
  }

  function project(
    target: ProjectionTarget,
  ): PublicProjection | SeatProjection {
    if (!current) throw new Error("The table has not been created.");
    const rulesProfile = rulesProfileOf(current);
    const accounting = accountingFor(rulesProfile);
    const accountingProjection =
      accounting && current.accounting
        ? accounting.project(current.accounting)
        : undefined;
    const shownCards = current.custody
      ? options.custody.shownCards(current.custody)
      : {};
    const board = current.custody
      ? options.custody.boardCards(current.custody)
      : [];
    const projectedSeats: ProjectedSeat[] = current.seats.map((seat) => {
      const exposedCards = shownCards[seat.seatId];
      const evaluation = exposedCards
        ? evaluateTexasHoldem([...board, ...exposedCards])
        : undefined;
      return {
        displayName: seat.displayName,
        ...(evaluation ? { evaluation } : {}),
        ...(exposedCards ? { holeCards: [...exposedCards] } : {}),
        seatId: seat.seatId,
        status: seat.status,
      };
    });
    const evaluatedSeats = projectedSeats.filter(
      (seat): seat is ProjectedSeat & { readonly evaluation: HandEvaluation } =>
        seat.evaluation !== undefined,
    );
    let showdown: ShowdownProjection | undefined;
    if (evaluatedSeats.length > 0) {
      let leaders: string[] = [];
      let leadingScore: readonly number[] | undefined;
      for (const seat of evaluatedSeats) {
        if (
          !leadingScore ||
          compareScores(seat.evaluation.score, leadingScore) > 0
        ) {
          leaders = [seat.seatId];
          leadingScore = seat.evaluation.score;
        } else if (compareScores(seat.evaluation.score, leadingScore) === 0) {
          leaders.push(seat.seatId);
        }
      }
      const unresolvedContender = projectedSeats.some((seat) =>
        ["active", "folded-provisional"].includes(seat.status),
      );
      showdown = {
        evaluatedSeatIds: evaluatedSeats.map((seat) => seat.seatId),
        leaders,
        status: unresolvedContender ? "partial" : "complete",
      };
    }
    const publicProjection: PublicProjection = {
      ...(accountingProjection ? { accounting: accountingProjection } : {}),
      board: [...board],
      cardStyle: cardStyleOf(current),
      dealerSeatId: current.dealerSeatId,
      ...(current.handId ? { handId: current.handId } : {}),
      phase: current.phase,
      revision: current.revision,
      rulesProfileId: rulesProfile.id,
      seats: projectedSeats,
      ...(showdown ? { showdown } : {}),
      tableTheme: tableThemeOf(current),
      tableId: options.tableId,
      view: "public",
    };
    if (target.kind === "public") return publicProjection;
    const holeCards = current.custody
      ? options.custody.seatCards(current.custody, target.seatId)
      : undefined;
    const seat = current.seats.find(
      (candidate) => candidate.seatId === target.seatId,
    );
    if (!holeCards || !seat)
      throw new Error("The requested seat is not active in this hand.");
    return {
      ...publicProjection,
      self: {
        holeCards: [...holeCards],
        ...(accounting && current.accounting
          ? {
              legalActions: accounting.legalActions(
                current.accounting,
                target.seatId,
              ),
            }
          : {}),
        seatId: target.seatId,
        status: seat.status,
      },
      view: "seat",
    };
  }

  async function submit(command: CommandEnvelope): Promise<CommandReceipt> {
    const revision = current?.revision ?? 0;
    if (command.tableId !== options.tableId)
      return rejected("table-mismatch", revision);
    if (command.authorityEpoch !== options.authorityEpoch)
      return rejected("authority-mismatch", revision);
    const fingerprint = commandFingerprint(command);
    const previousCommand = current?.acceptedCommands[command.commandId];
    if (previousCommand) {
      return previousCommand.fingerprint === fingerprint
        ? previousCommand.receipt
        : rejected("idempotency-conflict", revision);
    }
    if (command.expectedRevision !== revision)
      return rejected("revision-conflict", revision);
    const isHandScoped = [
      "RevealStreet",
      "FoldCards",
      "RetractFold",
      "FinalizeFold",
      "ShowCards",
      "MuckCards",
      "EndHand",
      "VoidHand",
      "SubmitBettingAction",
      "PrepareSettlement",
      "ConfirmSettlement",
    ].includes(command.payload.type);
    if (isHandScoped && current?.handId !== command.handId) {
      return rejected("hand-mismatch", revision);
    }

    let next: PersistedAuthorityState | undefined;
    let events: readonly EventSummary[] = [];

    switch (command.payload.type) {
      case "CreateTable": {
        if (current || !isHost(command.actor))
          return rejected("command-not-allowed", revision);
        const uniqueSeats = new Set(
          command.payload.seats.map((seat) => seat.seatId),
        );
        if (
          command.payload.seats.length < 2 ||
          command.payload.seats.length > 10 ||
          uniqueSeats.size !== command.payload.seats.length ||
          !uniqueSeats.has(command.payload.dealerSeatId)
        ) {
          return rejected("command-not-allowed", revision);
        }
        const rulesProfileCandidate =
          command.payload.rulesProfile ?? dealOnlyRulesProfile;
        if (!isRulesProfile(rulesProfileCandidate)) {
          return rejected("command-not-allowed", revision);
        }
        const rulesProfile = rulesProfileCandidate;
        let accountingState: AccountingState | undefined;
        if (rulesProfile.id === "nlhe-home-v1") {
          if (
            !Number.isSafeInteger(rulesProfile.startingStack) ||
            rulesProfile.startingStack <= 0
          ) {
            return rejected("command-not-allowed", revision);
          }
          let accounting: DigitalAccounting;
          try {
            accounting = createDigitalAccounting({
              bigBlind: rulesProfile.bigBlind,
              housePolicyId: rulesProfile.housePolicyId,
              smallBlind: rulesProfile.smallBlind,
            });
          } catch {
            return rejected("command-not-allowed", revision);
          }
          const created = accounting.submit(undefined, {
            seats: command.payload.seats.map((seat) => ({
              seatId: seat.seatId,
              stack: rulesProfile.startingStack,
            })),
            type: "CreateSession",
          });
          if (created.status === "rejected") {
            return rejected("command-not-allowed", revision);
          }
          accountingState = created.state;
        }
        next = {
          ...(accountingState ? { accounting: accountingState } : {}),
          acceptedCommands: {},
          authorityEpoch: options.authorityEpoch,
          cardStyle: defaultCardStyle,
          dealerSeatId: command.payload.dealerSeatId,
          history: [],
          phase: "lobby",
          revision: revision + 1,
          rulesProfile,
          schemaVersion: 1,
          seats: command.payload.seats.map((seat) => ({
            ...seat,
            sittingOutNextHand: false,
            status: "waiting",
          })),
          tableTheme: defaultTableTheme,
          tableId: options.tableId,
        };
        events = [
          { type: "TableCreated" },
          ...(accountingState
            ? [{ type: "AccountingSessionCreated" as const }]
            : []),
        ];
        break;
      }
      case "StartHand": {
        if (
          !current ||
          !isHost(command.actor) ||
          !["lobby", "complete"].includes(current.phase)
        ) {
          return rejected("command-not-allowed", revision);
        }
        const rulesProfile = rulesProfileOf(current);
        if (
          rulesProfile.id === "nlhe-home-v1" &&
          current.phase === "complete"
        ) {
          return rejected("command-not-allowed", revision);
        }
        const playingSeats = current.seats.filter(
          (seat) => !seat.sittingOutNextHand,
        );
        if (playingSeats.length < 2)
          return rejected("command-not-allowed", revision);
        const dealerSeatId = eligibleDealerSeatId(current, playingSeats);
        const handId = options.handIdFactory();
        const accounting = accountingFor(rulesProfile);
        let accountingState = current.accounting;
        let accountingEvents: readonly EventSummary[] = [];
        if (accounting) {
          if (!accountingState)
            return rejected("command-not-allowed", revision);
          const started = accounting.submit(accountingState, {
            activeSeatIds: playingSeats.map((seat) => seat.seatId),
            dealerSeatId,
            handId,
            type: "StartHand",
          });
          if (started.status === "rejected") {
            return rejected("command-not-allowed", revision);
          }
          accountingState = started.state;
          accountingEvents = started.events.map((event) => ({
            type: event.type,
          }));
        }
        next = {
          ...current,
          ...(accountingState ? { accounting: accountingState } : {}),
          custody: options.custody.startHand(
            playingSeats.map((seat) => seat.seatId),
          ),
          dealerSeatId,
          handId,
          phase: "preflop",
          revision: revision + 1,
          seats: current.seats.map((seat) => ({
            ...seat,
            status: seat.sittingOutNextHand ? "sitting-out" : "active",
          })),
        };
        events = [{ type: "HandStarted" }, ...accountingEvents];
        break;
      }
      case "RevealStreet": {
        if (
          !current?.custody ||
          accountingFor(rulesProfileOf(current)) ||
          !isHost(command.actor) ||
          expectedStreet(current.phase) !== command.payload.street
        ) {
          return rejected("command-not-allowed", revision);
        }
        const finalized = finalizeProvisionalSeats(current.seats);
        next = {
          ...current,
          custody: options.custody.revealStreet(
            current.custody,
            command.payload.street,
          ),
          phase: command.payload.street,
          revision: revision + 1,
          seats: finalized.seats,
        };
        events = [
          ...(finalized.changed ? [{ type: "FoldFinalized" as const }] : []),
          { type: "StreetRevealed" },
        ];
        break;
      }
      case "SubmitBettingAction": {
        if (
          !current?.custody ||
          !current.accounting ||
          command.actor.kind !== "seat"
        ) {
          return rejected("command-not-allowed", revision);
        }
        const accounting = accountingFor(rulesProfileOf(current));
        if (!accounting) return rejected("command-not-allowed", revision);
        const accountingCommand = toAccountingCommand(
          command.payload.action,
          command.actor.seatId,
        );
        if (!accountingCommand) {
          return rejected("command-not-allowed", revision);
        }
        const transition = accounting.submit(
          current.accounting,
          accountingCommand,
        );
        if (transition.status === "rejected") {
          return rejected("command-not-allowed", revision);
        }
        let custody = current.custody;
        let phase = current.phase;
        for (const event of transition.events) {
          if (event.type === "AccountingStreetStarted") {
            if (event.street !== "preflop") {
              custody = options.custody.revealStreet(custody, event.street);
              phase = event.street;
            }
          }
        }
        if (transition.state.phase === "showdown") phase = "showdown";
        next = {
          ...current,
          accounting: transition.state,
          custody,
          phase,
          revision: revision + 1,
          seats: current.seats.map((seat) => {
            const accountingSeat = transition.state.seats.find(
              (candidate) => candidate.seatId === seat.seatId,
            );
            return accountingSeat?.status === "folded"
              ? { ...seat, status: "folded" as const }
              : seat;
          }),
        };
        events = transition.events.map((event) => ({ type: event.type }));
        break;
      }
      case "PrepareSettlement": {
        if (
          !current?.custody ||
          !current.accounting ||
          !isHost(command.actor)
        ) {
          return rejected("command-not-allowed", revision);
        }
        const accounting = accountingFor(rulesProfileOf(current));
        if (!accounting) return rejected("command-not-allowed", revision);
        const accountingProjection = accounting.project(current.accounting);
        const pots = accountingProjection.pots;
        if (accountingProjection.phase !== "showdown" || !pots?.length) {
          return rejected("command-not-allowed", revision);
        }
        const settlingCustody = current.custody;
        const settlingSeats = current.seats;
        const board = options.custody.boardCards(settlingCustody);
        const winnersByPot: string[][] = [];
        const explanations: string[] = [];
        const contestedWinnerIds = new Set<string>();
        for (const pot of pots) {
          if (pot.eligibleSeatIds.length === 1) {
            const winnerSeatId = pot.eligibleSeatIds[0];
            if (!winnerSeatId) return rejected("command-not-allowed", revision);
            const displayName =
              settlingSeats.find((seat) => seat.seatId === winnerSeatId)
                ?.displayName ?? winnerSeatId;
            winnersByPot.push([winnerSeatId]);
            explanations.push(`${displayName} wins ${pot.amount} uncontested.`);
            continue;
          }
          const evaluated = pot.eligibleSeatIds.flatMap((seatId) => {
            const holeCards = options.custody.seatCards(
              settlingCustody,
              seatId,
            );
            const evaluation = holeCards
              ? evaluateTexasHoldem([...board, ...holeCards])
              : undefined;
            return evaluation ? [{ evaluation, seatId }] : [];
          });
          if (evaluated.length !== pot.eligibleSeatIds.length) {
            return rejected("command-not-allowed", revision);
          }
          let leadingScore: readonly number[] | undefined;
          let winners: typeof evaluated = [];
          for (const entry of evaluated) {
            if (
              !leadingScore ||
              compareScores(entry.evaluation.score, leadingScore) > 0
            ) {
              leadingScore = entry.evaluation.score;
              winners = [entry];
            } else if (
              compareScores(entry.evaluation.score, leadingScore) === 0
            ) {
              winners.push(entry);
            }
          }
          if (winners.length === 0)
            return rejected("command-not-allowed", revision);
          const winnerSeatIds = winners.map((winner) => winner.seatId);
          for (const seatId of winnerSeatIds) contestedWinnerIds.add(seatId);
          const winnerNames = winnerSeatIds.map(
            (seatId) =>
              settlingSeats.find((seat) => seat.seatId === seatId)
                ?.displayName ?? seatId,
          );
          winnersByPot.push(winnerSeatIds);
          explanations.push(
            winnerSeatIds.length === 1
              ? `${winnerNames[0]} wins ${pot.amount} with ${winners[0]?.evaluation.label}.`
              : `${winnerNames.join(" and ")} split ${pot.amount} with ${winners[0]?.evaluation.label}.`,
          );
        }
        const transition = accounting.submit(current.accounting, {
          explanations,
          type: "ProposeSettlement",
          winnersByPot,
        });
        if (transition.status === "rejected") {
          return rejected("command-not-allowed", revision);
        }
        let custody = current.custody;
        for (const seatId of contestedWinnerIds) {
          custody = options.custody.showSeat(custody, seatId);
        }
        next = {
          ...current,
          accounting: transition.state,
          custody,
          phase: "settlement-pending",
          revision: revision + 1,
          seats: current.seats.map((seat) => {
            const accountingSeat = transition.state.seats.find(
              (candidate) => candidate.seatId === seat.seatId,
            );
            if (accountingSeat?.status === "folded") {
              return { ...seat, status: "folded" as const };
            }
            if (contestedWinnerIds.has(seat.seatId)) {
              return { ...seat, status: "shown" as const };
            }
            return { ...seat, status: "mucked" as const };
          }),
        };
        events = transition.events.map((event) => ({ type: event.type }));
        break;
      }
      case "ConfirmSettlement": {
        if (
          !current?.accounting ||
          !isHost(command.actor) ||
          current.phase !== "settlement-pending"
        ) {
          return rejected("command-not-allowed", revision);
        }
        const accounting = accountingFor(rulesProfileOf(current));
        if (!accounting) return rejected("command-not-allowed", revision);
        const transition = accounting.submit(current.accounting, {
          type: "ConfirmSettlement",
        });
        if (transition.status === "rejected") {
          return rejected("command-not-allowed", revision);
        }
        next = {
          ...current,
          accounting: transition.state,
          phase: "complete",
          revision: revision + 1,
        };
        events = transition.events.map((event) => ({ type: event.type }));
        break;
      }
      case "FoldCards": {
        if (
          !current?.custody ||
          accountingFor(rulesProfileOf(current)) ||
          command.actor.kind !== "seat"
        )
          return rejected("command-not-allowed", revision);
        const actingSeatId = command.actor.seatId;
        const seat = current.seats.find(
          (candidate) => candidate.seatId === actingSeatId,
        );
        if (!seat || seat.status !== "active" || current.phase === "complete")
          return rejected("command-not-allowed", revision);
        next = {
          ...current,
          revision: revision + 1,
          seats: current.seats.map((candidate) =>
            candidate.seatId === actingSeatId
              ? { ...candidate, status: "folded-provisional" }
              : candidate,
          ),
        };
        events = [{ type: "FoldStarted" }];
        break;
      }
      case "RetractFold": {
        if (
          !current?.custody ||
          accountingFor(rulesProfileOf(current)) ||
          command.actor.kind !== "seat"
        )
          return rejected("command-not-allowed", revision);
        const actingSeatId = command.actor.seatId;
        const seat = current.seats.find(
          (candidate) => candidate.seatId === actingSeatId,
        );
        if (!seat || seat.status !== "folded-provisional")
          return rejected("command-not-allowed", revision);
        next = {
          ...current,
          revision: revision + 1,
          seats: current.seats.map((candidate) =>
            candidate.seatId === actingSeatId
              ? { ...candidate, status: "active" }
              : candidate,
          ),
        };
        events = [{ type: "FoldRetracted" }];
        break;
      }
      case "FinalizeFold": {
        if (
          !current?.custody ||
          accountingFor(rulesProfileOf(current)) ||
          command.actor.kind !== "seat"
        )
          return rejected("command-not-allowed", revision);
        const actingSeatId = command.actor.seatId;
        const seat = current.seats.find(
          (candidate) => candidate.seatId === actingSeatId,
        );
        if (!seat || seat.status !== "folded-provisional")
          return rejected("command-not-allowed", revision);
        next = {
          ...current,
          revision: revision + 1,
          seats: current.seats.map((candidate) =>
            candidate.seatId === actingSeatId
              ? { ...candidate, status: "folded" }
              : candidate,
          ),
        };
        events = [{ type: "FoldFinalized" }];
        break;
      }
      case "ShowCards": {
        if (
          !current?.custody ||
          accountingFor(rulesProfileOf(current)) ||
          command.actor.kind !== "seat"
        ) {
          return rejected("command-not-allowed", revision);
        }
        const actingSeatId = command.actor.seatId;
        const seat = current.seats.find(
          (candidate) => candidate.seatId === actingSeatId,
        );
        if (!seat || seat.status !== "active" || current.phase === "complete")
          return rejected("command-not-allowed", revision);
        const finalized = finalizeProvisionalSeats(current.seats);
        next = {
          ...current,
          custody: options.custody.showSeat(current.custody, seat.seatId),
          revision: revision + 1,
          seats: finalized.seats.map((candidate) =>
            candidate.seatId === actingSeatId
              ? { ...candidate, status: "shown" }
              : candidate,
          ),
        };
        events = [
          ...(finalized.changed ? [{ type: "FoldFinalized" as const }] : []),
          { type: "CardsShown" },
        ];
        break;
      }
      case "MuckCards": {
        if (
          !current?.custody ||
          accountingFor(rulesProfileOf(current)) ||
          command.actor.kind !== "seat"
        )
          return rejected("command-not-allowed", revision);
        const actingSeatId = command.actor.seatId;
        const seat = current.seats.find(
          (candidate) => candidate.seatId === actingSeatId,
        );
        if (
          !seat ||
          !["active", "folded-provisional", "folded"].includes(seat.status) ||
          current.phase === "complete"
        ) {
          return rejected("command-not-allowed", revision);
        }
        next = {
          ...current,
          revision: revision + 1,
          seats: current.seats.map((candidate) =>
            candidate.seatId === actingSeatId
              ? { ...candidate, status: "mucked" }
              : candidate,
          ),
        };
        events = [{ type: "CardsMucked" }];
        break;
      }
      case "EndHand": {
        if (
          !current?.custody ||
          accountingFor(rulesProfileOf(current)) ||
          !isHost(command.actor) ||
          current.phase === "complete"
        ) {
          return rejected("command-not-allowed", revision);
        }
        const finalized = finalizeProvisionalSeats(current.seats);
        next = {
          ...current,
          phase: "complete",
          revision: revision + 1,
          seats: finalized.seats,
        };
        events = [
          ...(finalized.changed ? [{ type: "FoldFinalized" as const }] : []),
          { type: "HandEnded" },
        ];
        break;
      }
      case "RelocateDealer": {
        const dealerSeatId = command.payload.dealerSeatId;
        if (
          !current ||
          !isHost(command.actor) ||
          !["lobby", "complete"].includes(current.phase) ||
          !current.seats.some((seat) => seat.seatId === dealerSeatId)
        ) {
          return rejected("command-not-allowed", revision);
        }
        next = {
          ...current,
          dealerSeatId,
          revision: revision + 1,
        };
        events = [{ type: "DealerRelocated" }];
        break;
      }
      case "VoidHand": {
        if (
          !current?.custody ||
          accountingFor(rulesProfileOf(current)) ||
          !isHost(command.actor) ||
          current.phase === "complete" ||
          command.payload.reason.trim().length === 0
        ) {
          return rejected("command-not-allowed", revision);
        }
        const finalized = finalizeProvisionalSeats(current.seats);
        next = {
          ...current,
          phase: "complete",
          revision: revision + 1,
          seats: finalized.seats,
        };
        events = [
          ...(finalized.changed ? [{ type: "FoldFinalized" as const }] : []),
          { type: "HandVoided" },
        ];
        break;
      }
      case "RecordCorrection": {
        const correctedIds = new Set(command.payload.correctedEventIds);
        const activeHistory = current?.history ?? [];
        if (
          !current ||
          !isHost(command.actor) ||
          command.payload.reason.trim().length === 0 ||
          correctedIds.size === 0 ||
          correctedIds.size !== command.payload.correctedEventIds.length ||
          command.payload.correctedEventIds.some(
            (eventId) =>
              !activeHistory.some((event) => event.eventId === eventId),
          )
        ) {
          return rejected("command-not-allowed", revision);
        }
        next = { ...current, revision: revision + 1 };
        events = [{ type: "CorrectionRecorded" }];
        break;
      }
      case "RegisterSeat": {
        const seatDefinition = command.payload.seat;
        if (
          !current ||
          accountingFor(rulesProfileOf(current)) ||
          !isHost(command.actor) ||
          current.seats.length >= 10 ||
          seatDefinition.displayName.trim().length === 0 ||
          current.seats.some((seat) => seat.seatId === seatDefinition.seatId)
        ) {
          return rejected("command-not-allowed", revision);
        }
        next = {
          ...current,
          revision: revision + 1,
          seats: [
            ...current.seats,
            {
              ...seatDefinition,
              sittingOutNextHand: false,
              status: "waiting",
            },
          ],
        };
        events = [{ type: "SeatRegistered" }];
        break;
      }
      case "UnregisterSeat": {
        const seatId = command.payload.seatId;
        const betweenHands =
          current && ["lobby", "complete"].includes(current.phase);
        if (
          !current ||
          !betweenHands ||
          !isHost(command.actor) ||
          accountingFor(rulesProfileOf(current)) ||
          !current.seats.some((seat) => seat.seatId === seatId)
        ) {
          return rejected("command-not-allowed", revision);
        }
        const seats = current.seats.filter((seat) => seat.seatId !== seatId);
        next = {
          ...current,
          dealerSeatId:
            current.dealerSeatId === seatId
              ? (seats[0]?.seatId ?? "")
              : current.dealerSeatId,
          revision: revision + 1,
          seats,
        };
        events = [{ type: "SeatUnregistered" }];
        break;
      }
      case "SetSeatParticipation": {
        if (!current) return rejected("command-not-allowed", revision);
        const seatId = command.payload.seatId;
        const sittingOut = command.payload.sittingOut;
        const authorized =
          isHost(command.actor) ||
          (command.actor.kind === "seat" && command.actor.seatId === seatId);
        const seat = current.seats.find(
          (candidate) => candidate.seatId === seatId,
        );
        if (!authorized || !seat)
          return rejected("command-not-allowed", revision);
        const betweenHands = ["lobby", "complete"].includes(current.phase);
        next = {
          ...current,
          revision: revision + 1,
          seats: current.seats.map((candidate) =>
            candidate.seatId === seatId
              ? {
                  ...candidate,
                  sittingOutNextHand: sittingOut,
                  status: betweenHands
                    ? sittingOut
                      ? "sitting-out"
                      : "waiting"
                    : candidate.status,
                }
              : candidate,
          ),
        };
        events = [{ type: "SeatParticipationChanged" }];
        break;
      }
      case "SetTableTheme": {
        if (
          !current ||
          !isHost(command.actor) ||
          !isTableTheme(command.payload.tableTheme)
        ) {
          return rejected("command-not-allowed", revision);
        }
        next = {
          ...current,
          revision: revision + 1,
          tableTheme: command.payload.tableTheme,
        };
        events = [{ type: "TableThemeChanged" }];
        break;
      }
      case "SetCardStyle": {
        if (
          !current ||
          !isHost(command.actor) ||
          !isCardStyle(command.payload.cardStyle)
        ) {
          return rejected("command-not-allowed", revision);
        }
        next = {
          ...current,
          cardStyle: command.payload.cardStyle,
          revision: revision + 1,
        };
        events = [{ type: "CardStyleChanged" }];
        break;
      }
    }

    if (!next) return rejected("command-not-allowed", revision);
    next = appendHistory(next, command, events);
    const receipt: AcceptedReceipt = {
      events,
      ...(next.handId ? { handId: next.handId } : {}),
      revision: next.revision,
      status: "accepted",
    };
    const committedState: PersistedAuthorityState = {
      ...next,
      acceptedCommands: {
        ...next.acceptedCommands,
        [command.commandId]: { fingerprint, receipt },
      },
    };
    let commit: CommitResult;
    try {
      commit = await options.store.commit(revision, {
        revision: committedState.revision,
        state: committedState,
      });
    } catch {
      return rejected("persistence-failed", revision);
    }
    if (commit.status === "revision-conflict") {
      const concurrentCommand = current?.acceptedCommands[command.commandId];
      if (concurrentCommand) {
        return concurrentCommand.fingerprint === fingerprint
          ? concurrentCommand.receipt
          : rejected(
              "idempotency-conflict",
              current?.revision ?? commit.actualRevision,
            );
      }
      return rejected("revision-conflict", commit.actualRevision);
    }
    if (commit.status === "failed")
      return rejected("persistence-failed", revision);
    current = committedState;
    return receipt;
  }

  return { history, project, recover, submit };
}
