import type { Card } from "@html-poker/card-custody";

/** Public facts only. Never a host recovery snapshot or a private-seat projection. */
export interface PublicHistorySeat {
  readonly seatId: string;
  readonly displayName: string;
  readonly status: string;
  readonly stack?: number;
  readonly contribution?: number;
  readonly holeCards?: readonly Card[];
}
export interface PublicHistoryFrame {
  readonly handId: string;
  readonly revision: number;
  readonly at: string;
  readonly phase: string;
  readonly action: {
    readonly type: string;
    readonly seatId?: string;
    readonly amount?: number;
    readonly to?: number;
    readonly note?: string;
  };
  readonly events: readonly {
    readonly type: string;
    readonly seatId?: string;
    readonly amount?: number;
  }[];
  readonly dealerSeatId: string;
  readonly board: readonly Card[];
  readonly seats: readonly PublicHistorySeat[];
  readonly potTotal?: number;
  readonly awards?: readonly {
    readonly seatId: string;
    readonly amount: number;
  }[];
}
export interface PublicTableHistory {
  readonly format: "our-poker-table-public-history";
  readonly version: 1;
  readonly tableId: string;
  readonly exportedAt: string;
  /** False for migrated tables whose early public actions were never recorded. */
  readonly completeFromFirstHand: boolean;
  readonly frames: readonly PublicHistoryFrame[];
}
export interface PublicHistoryHand {
  readonly handId: string;
  readonly startedAt: string;
  readonly frames: readonly PublicHistoryFrame[];
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FRAMES = 100_000;
const MAX_SEATS_PER_FRAME = 10;
const MAX_EVENTS_PER_FRAME = 256;
const MAX_AWARDS_PER_FRAME = 100;
const MAX_TEXT_LENGTH = 4_096;
const MAX_ID_LENGTH = 256;
const MAX_DISPLAY_NAME_LENGTH = 256;
const CARD_ID_PATTERN = /^[2-9TJQKA][cdhs]$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

type UnknownRecord = Record<string, unknown>;

function invalid(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): UnknownRecord {
  if (!isRecord(value)) return invalid("Public history has an invalid shape.");
  return value;
}

function checkKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  if (required.some((key) => !Object.hasOwn(value, key))) {
    invalid("Public history is missing required fields.");
  }
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    invalid("Public history contains unsupported fields.");
  }
}

function stringValue(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    (!allowEmpty && value.length === 0)
  ) {
    return invalid("Public history contains an invalid text value.");
  }
  return value;
}

function idValue(value: unknown): string {
  return stringValue(value, MAX_ID_LENGTH);
}

function numberValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return invalid("Public history contains an invalid amount.");
  }
  return value;
}

function arrayValue(value: unknown, maxLength: number): unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    return invalid("Public history contains an invalid list.");
  }
  return value;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysByMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const days = daysByMonth[month - 1];
  return days !== undefined && day <= days;
}

function timestampValue(value: unknown): {
  readonly text: string;
  readonly time: number;
} {
  if (typeof value !== "string") {
    return invalid("Public history contains an invalid timestamp.");
  }
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) return invalid("Public history contains an invalid timestamp.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const zoneHour = match[10] === undefined ? 0 : Number(match[10]);
  const zoneMinute = match[11] === undefined ? 0 : Number(match[11]);
  if (
    !validCalendarDate(year, month, day) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    zoneHour > 23 ||
    zoneMinute > 59
  ) {
    return invalid("Public history contains an invalid timestamp.");
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return invalid("Public history contains an invalid timestamp.");
  }
  return { text: value, time };
}

function dateOnlyValue(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!validCalendarDate(year, month, day)) {
    return invalid("Search contains an invalid date.");
  }
  return Date.parse(`${value}T00:00:00.000Z`);
}

function parseCard(value: unknown): Card {
  if (typeof value !== "string" || !CARD_ID_PATTERN.test(value)) {
    return invalid("Public history contains an invalid card ID.");
  }
  return value as Card;
}

function parseCardList(value: unknown, maxLength: number): readonly Card[] {
  return arrayValue(value, maxLength).map(parseCard);
}

function parseSeat(value: unknown): PublicHistorySeat {
  const source = record(value);
  checkKeys(
    source,
    ["seatId", "displayName", "status"],
    ["stack", "contribution", "holeCards"],
  );
  const seatId = idValue(source.seatId);
  const displayName = stringValue(
    source.displayName,
    MAX_DISPLAY_NAME_LENGTH,
    true,
  );
  const status = stringValue(source.status, 128);
  const seat: {
    seatId: string;
    displayName: string;
    status: string;
    stack?: number;
    contribution?: number;
    holeCards?: readonly Card[];
  } = { seatId, displayName, status };
  if (Object.hasOwn(source, "stack")) seat.stack = numberValue(source.stack);
  if (Object.hasOwn(source, "contribution")) {
    seat.contribution = numberValue(source.contribution);
  }
  if (Object.hasOwn(source, "holeCards")) {
    seat.holeCards = parseCardList(source.holeCards, 2);
  }
  return seat;
}

function parseAction(value: unknown): PublicHistoryFrame["action"] {
  const source = record(value);
  checkKeys(source, ["type"], ["seatId", "amount", "to", "note"]);
  const action: {
    type: string;
    seatId?: string;
    amount?: number;
    to?: number;
    note?: string;
  } = { type: stringValue(source.type, 128) };
  if (Object.hasOwn(source, "seatId")) action.seatId = idValue(source.seatId);
  if (Object.hasOwn(source, "amount")) {
    action.amount = numberValue(source.amount);
  }
  if (Object.hasOwn(source, "to")) action.to = numberValue(source.to);
  if (Object.hasOwn(source, "note")) {
    action.note = stringValue(source.note, MAX_TEXT_LENGTH, true);
  }
  return action;
}

function parseEvent(value: unknown): PublicHistoryFrame["events"][number] {
  const source = record(value);
  checkKeys(source, ["type"], ["seatId", "amount"]);
  const event: { type: string; seatId?: string; amount?: number } = {
    type: stringValue(source.type, 128),
  };
  if (Object.hasOwn(source, "seatId")) event.seatId = idValue(source.seatId);
  if (Object.hasOwn(source, "amount")) {
    event.amount = numberValue(source.amount);
  }
  return event;
}

function parseAward(value: unknown): {
  readonly seatId: string;
  readonly amount: number;
} {
  const source = record(value);
  checkKeys(source, ["seatId", "amount"]);
  return { seatId: idValue(source.seatId), amount: numberValue(source.amount) };
}

function parseFrame(value: unknown): PublicHistoryFrame {
  const source = record(value);
  checkKeys(
    source,
    [
      "handId",
      "revision",
      "at",
      "phase",
      "action",
      "events",
      "dealerSeatId",
      "board",
      "seats",
    ],
    ["potTotal", "awards"],
  );
  if (
    typeof source.revision !== "number" ||
    !Number.isSafeInteger(source.revision) ||
    source.revision < 1
  ) {
    return invalid("Public history contains an invalid revision.");
  }
  const at = timestampValue(source.at).text;
  const seats = arrayValue(source.seats, MAX_SEATS_PER_FRAME).map(parseSeat);
  const seatIds = new Set<string>();
  const visibleCards = new Set<Card>();
  const board = parseCardList(source.board, 5);
  for (const card of board) {
    if (visibleCards.has(card)) {
      invalid("Public history contains duplicate cards in a frame.");
    }
    visibleCards.add(card);
  }
  for (const seat of seats) {
    if (seatIds.has(seat.seatId)) {
      invalid("Public history contains duplicate seats in a frame.");
    }
    seatIds.add(seat.seatId);
    for (const card of seat.holeCards ?? []) {
      if (visibleCards.has(card)) {
        invalid("Public history contains duplicate cards in a frame.");
      }
      visibleCards.add(card);
    }
  }
  const events = arrayValue(source.events, MAX_EVENTS_PER_FRAME).map(
    parseEvent,
  );
  const frame: {
    handId: string;
    revision: number;
    at: string;
    phase: string;
    action: PublicHistoryFrame["action"];
    events: PublicHistoryFrame["events"];
    dealerSeatId: string;
    board: readonly Card[];
    seats: readonly PublicHistorySeat[];
    potTotal?: number;
    awards?: readonly { readonly seatId: string; readonly amount: number }[];
  } = {
    handId: idValue(source.handId),
    revision: source.revision,
    at,
    phase: stringValue(source.phase, 128),
    action: parseAction(source.action),
    events,
    dealerSeatId: idValue(source.dealerSeatId),
    board,
    seats,
  };
  if (Object.hasOwn(source, "potTotal")) {
    frame.potTotal = numberValue(source.potTotal);
  }
  if (Object.hasOwn(source, "awards")) {
    frame.awards = arrayValue(source.awards, MAX_AWARDS_PER_FRAME).map(
      parseAward,
    );
  }
  return frame;
}

/** Parse a portable public-history file into an allowlisted, detached value. */
export function parsePublicTableHistory(text: string): PublicTableHistory {
  if (typeof text !== "string") {
    return invalid("Public history input must be text.");
  }
  if (text.length > MAX_FILE_BYTES) {
    return invalid("Public history exceeds the 20 MB limit.");
  }
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
    return invalid("Public history exceeds the 20 MB limit.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return invalid("Public history is not valid JSON.");
  }
  const source = record(parsed);
  checkKeys(source, [
    "format",
    "version",
    "tableId",
    "exportedAt",
    "completeFromFirstHand",
    "frames",
  ]);
  if (
    source.format !== "our-poker-table-public-history" ||
    source.version !== 1
  ) {
    return invalid("Public history format or version is unsupported.");
  }
  if (typeof source.completeFromFirstHand !== "boolean") {
    return invalid("Public history has an invalid completeness marker.");
  }
  const frames = arrayValue(source.frames, MAX_FRAMES).map(parseFrame);
  let previousRevision = 0;
  for (const frame of frames) {
    if (frame.revision <= previousRevision) {
      invalid("Public history revisions must increase.");
    }
    previousRevision = frame.revision;
  }
  return {
    format: "our-poker-table-public-history",
    version: 1,
    tableId: idValue(source.tableId),
    exportedAt: timestampValue(source.exportedAt).text,
    completeFromFirstHand: source.completeFromFirstHand,
    frames,
  };
}

/** Group frames by hand in first-seen order, using the StartHand frame time. */
export function groupPublicHistoryHands(
  history: PublicTableHistory,
): readonly PublicHistoryHand[] {
  const byHand = new Map<string, PublicHistoryFrame[]>();
  for (const frame of history.frames) {
    const group = byHand.get(frame.handId);
    if (group) group.push(frame);
    else byHand.set(frame.handId, [frame]);
  }
  return [...byHand].map(([handId, frames]) => {
    const startFrame = frames.find(
      (frame) => frame.action.type === "StartHand",
    );
    const first = startFrame ?? frames[0];
    if (!first) throw new Error("A history hand has no frames.");
    return {
      handId,
      startedAt: first.at,
      frames,
    };
  });
}

function normalizedCardQuery(
  cards: string | undefined,
): readonly Card[] | undefined {
  if (cards === undefined) return undefined;
  const trimmed = cards.trim();
  if (trimmed.length === 0) return undefined;
  const cardTokens = trimmed.split(/\s+/);
  if (cardTokens.length > 2) {
    return invalid("Card search accepts at most two cards.");
  }
  const symbols: Readonly<Record<string, string>> = {
    "♣": "c",
    "♦": "d",
    "♥": "h",
    "♠": "s",
  };
  const normalized = cardTokens.map((token) => {
    const match = /^([2-9tjqka])([cdhs♣♦♥♠])$/i.exec(token);
    if (!match) return invalid("Card search contains an invalid card.");
    const rank = match[1]?.toUpperCase();
    const suit = match[2];
    const canonicalSuit = symbols[suit ?? ""] ?? suit?.toLowerCase();
    if (!rank || !canonicalSuit) {
      return invalid("Card search contains an invalid card.");
    }
    return `${rank}${canonicalSuit}` as Card;
  });
  if (new Set(normalized).size !== normalized.length) {
    return invalid("Card search contains a duplicate card.");
  }
  return normalized;
}

function searchTimeBound(value: string, side: "from" | "to"): number {
  const trimmed = value.trim();
  const dateOnly = dateOnlyValue(trimmed);
  if (dateOnly !== undefined) {
    return side === "from" ? dateOnly : dateOnly + 86_400_000 - 1;
  }
  return timestampValue(trimmed).time;
}

function participatingSeats(hand: PublicHistoryHand): PublicHistorySeat[] {
  const seatsById = new Map<string, PublicHistorySeat>();
  for (const frame of hand.frames) {
    for (const seat of frame.seats) {
      if (seat.status.toLowerCase() !== "sitting-out") {
        seatsById.set(seat.seatId, seat);
      }
    }
  }
  return [...seatsById.values()];
}

function handHasCards(
  hand: PublicHistoryHand,
  cards: readonly Card[],
): boolean {
  return hand.frames.some((frame) =>
    frame.seats.some((seat) => {
      const publicHoleCards = seat.holeCards;
      return (
        publicHoleCards !== undefined &&
        cards.every((card) => publicHoleCards.includes(card))
      );
    }),
  );
}

/** Search by hand start time, participant name, and publicly revealed hole cards. */
export function searchPublicHistoryHands(
  history: PublicTableHistory,
  query: {
    readonly cards?: string;
    readonly from?: string;
    readonly to?: string;
    readonly player?: string;
  },
): readonly PublicHistoryHand[] {
  const cards = normalizedCardQuery(query.cards);
  const from =
    query.from === undefined ? undefined : searchTimeBound(query.from, "from");
  const to =
    query.to === undefined ? undefined : searchTimeBound(query.to, "to");
  if (from !== undefined && to !== undefined && from > to) {
    return invalid("Search date range is invalid.");
  }
  const player = query.player?.trim().toLowerCase();
  const hands = groupPublicHistoryHands(history);
  return hands.filter((hand) => {
    const startedAt = timestampValue(hand.startedAt).time;
    if (from !== undefined && startedAt < from) return false;
    if (to !== undefined && startedAt > to) return false;
    if (cards && !handHasCards(hand, cards)) return false;
    if (
      player &&
      !participatingSeats(hand).some((seat) =>
        seat.displayName.toLowerCase().includes(player),
      )
    ) {
      return false;
    }
    return true;
  });
}

function sanitizedPlayerName(displayName: string): string {
  const normalized = displayName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const slug = normalized
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "player";
}

/** Build a safe player filename using the first hand they actually played. */
export function publicHistoryFilename(
  history: PublicTableHistory,
  seatId: string,
  displayName: string,
): string {
  const player = sanitizedPlayerName(displayName);
  const firstHand = groupPublicHistoryHands(history).find((hand) =>
    participatingSeats(hand).some((seat) => seat.seatId === seatId),
  );
  if (!firstHand) return `${player}_no-hands.json`;
  const utc = new Date(firstHand.startedAt)
    .toISOString()
    .slice(0, 19)
    .replace("T", "_")
    .replaceAll(":", "-");
  return `${player}_${utc}Z.json`;
}
