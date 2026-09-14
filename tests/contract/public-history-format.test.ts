import { expect, test } from "vitest";
import {
  groupPublicHistoryHands,
  parsePublicTableHistory,
  publicHistoryFilename,
  searchPublicHistoryHands,
  type PublicHistoryFrame,
  type PublicTableHistory,
} from "@html-poker/game-core";

const SEAT_ALICE = {
  seatId: "alice",
  displayName: "Alice",
  status: "active",
};
const SEAT_BOB = {
  seatId: "bob",
  displayName: "Bob",
  status: "active",
};

function frame(
  handId: string,
  revision: number,
  at: string,
  actionType: string,
  seats: readonly unknown[] = [SEAT_ALICE, SEAT_BOB],
  board: readonly string[] = [],
): Record<string, unknown> {
  return {
    handId,
    revision,
    at,
    phase: "preflop",
    action: { type: actionType },
    events: [],
    dealerSeatId: "alice",
    board,
    seats,
  };
}

function rawHistory(): Record<string, unknown> {
  return {
    format: "our-poker-table-public-history",
    version: 1,
    tableId: "table-1",
    exportedAt: "2026-09-14T13:00:00+08:00",
    completeFromFirstHand: true,
    frames: [
      frame("hand-1", 1, "2026-09-14T10:00:00+08:00", "StartHand", [
        { ...SEAT_ALICE, status: "sitting-out" },
        { ...SEAT_BOB, status: "active" },
      ]),
      frame(
        "hand-1",
        2,
        "2026-09-14T10:01:00+08:00",
        "ShowCards",
        [
          { ...SEAT_ALICE, status: "sitting-out" },
          { ...SEAT_BOB, status: "shown", holeCards: ["Ah", "Ks"] },
        ],
        ["2c", "3d", "4h"],
      ),
      frame("hand-2", 3, "2026-09-14T11:00:00+08:00", "StartHand", [
        { ...SEAT_ALICE, status: "active" },
        { ...SEAT_BOB, status: "active" },
      ]),
      frame(
        "hand-2",
        4,
        "2026-09-14T11:02:00+08:00",
        "ShowCards",
        [
          { ...SEAT_ALICE, status: "shown", holeCards: ["Qd", "Jc"] },
          { ...SEAT_BOB, status: "active" },
        ],
        ["Ah", "2s", "3s"],
      ),
    ],
  };
}

function parseFixture(): PublicTableHistory {
  return parsePublicTableHistory(JSON.stringify(rawHistory()));
}

function expectInvalid(raw: unknown): void {
  let caught: unknown;
  try {
    parsePublicTableHistory(JSON.stringify(raw));
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(caught).not.toBeInstanceOf(SyntaxError);
  expect((caught as Error).message).not.toContain("secret");
}

test("parses an allowlisted detached public copy and preserves names as inert text", () => {
  const raw = rawHistory();
  const frames = raw.frames as Record<string, unknown>[];
  const firstHand = frames[0];
  const firstSeats = firstHand?.seats as Record<string, unknown>[];
  const maliciousName = "<img src=x onerror=alert(1)>/ Alice";
  if (!firstSeats?.[0]) throw new Error("Fixture seat missing");
  firstSeats[0].displayName = maliciousName;

  const parsed = parsePublicTableHistory(JSON.stringify(raw));
  expect(parsed.frames[0]?.seats[0]?.displayName).toBe(maliciousName);
  expect(parsed.frames).not.toBe(frames);
  expect(publicHistoryFilename(parsed, "alice", maliciousName)).toMatch(
    /^img-src-x-onerror-alert-1-Alice_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}Z\.json$/,
  );
});

test("rejects unsupported nested fields instead of carrying private data through", () => {
  const raw = rawHistory();
  const frames = raw.frames as Record<string, unknown>[];
  const showFrame = frames[1];
  const seats = showFrame?.seats as Record<string, unknown>[];
  if (!seats?.[1]) throw new Error("Fixture seat missing");
  seats[1].privateCards = ["Qc", "Qh"];
  let caught: unknown;
  try {
    parsePublicTableHistory(JSON.stringify(raw));
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).not.toContain("privateCards");
});

test("rejects malformed versions, cards, duplicate visible cards, and revision order", () => {
  const badVersion = rawHistory();
  badVersion.version = 2;
  expectInvalid(badVersion);

  const badCard = rawHistory();
  const badCardFrames = badCard.frames as Record<string, unknown>[];
  const badCardSeats = badCardFrames[1]?.seats as Record<string, unknown>[];
  if (!badCardSeats?.[1]) throw new Error("Fixture seat missing");
  badCardSeats[1].holeCards = ["1x", "As"];
  expectInvalid(badCard);

  const duplicateCard = rawHistory();
  const duplicateFrames = duplicateCard.frames as Record<string, unknown>[];
  duplicateFrames[1]!.board = ["Ah", "3d"];
  expectInvalid(duplicateCard);

  const badRevision = rawHistory();
  const badRevisionFrames = badRevision.frames as Record<string, unknown>[];
  badRevisionFrames[2]!.revision = 2;
  expectInvalid(badRevision);
});

test("requires real timezone-bearing ISO timestamps", () => {
  const missingZone = rawHistory();
  const missingZoneFrames = missingZone.frames as Record<string, unknown>[];
  missingZoneFrames[0]!.at = "2026-09-14T10:00:00";
  expectInvalid(missingZone);

  const invalidCalendarDate = rawHistory();
  const invalidDateFrames = invalidCalendarDate.frames as Record<
    string,
    unknown
  >[];
  invalidDateFrames[0]!.at = "2025-02-29T10:00:00Z";
  expectInvalid(invalidCalendarDate);

  const invalidExportTime = rawHistory();
  invalidExportTime.exportedAt = "2026-13-14T13:00:00Z";
  expectInvalid(invalidExportTime);
});

test("enforces the file, frame, seat, and per-frame list limits", () => {
  expect(() =>
    parsePublicTableHistory(" ".repeat(20 * 1024 * 1024 + 1)),
  ).toThrow(/20 MB/);

  const tooManyFrames = rawHistory();
  tooManyFrames.frames = Array.from({ length: 100_001 }, () => null);
  expectInvalid(tooManyFrames);

  const tooManySeats = rawHistory();
  const seatFrames = tooManySeats.frames as Record<string, unknown>[];
  seatFrames[0]!.seats = Array.from({ length: 11 }, (_, index) => ({
    seatId: `seat-${index}`,
    displayName: `Seat ${index}`,
    status: "active",
  }));
  expectInvalid(tooManySeats);

  const tooManyEvents = rawHistory();
  const eventFrames = tooManyEvents.frames as Record<string, unknown>[];
  eventFrames[0]!.events = Array.from({ length: 257 }, () => ({
    type: "Event",
  }));
  expectInvalid(tooManyEvents);
});

test("groups by hand, starting each hand from its StartHand frame", () => {
  const hands = groupPublicHistoryHands(parseFixture());
  expect(hands.map((hand) => [hand.handId, hand.startedAt])).toEqual([
    ["hand-1", "2026-09-14T10:00:00+08:00"],
    ["hand-2", "2026-09-14T11:00:00+08:00"],
  ]);
  expect(hands.map((hand) => hand.frames.length)).toEqual([2, 2]);
});

test("searches hole cards on one player's public hand and filters by participant name", () => {
  const history = parseFixture();
  expect(
    searchPublicHistoryHands(history, { cards: "Ah Ks" }).map(
      (hand) => hand.handId,
    ),
  ).toEqual(["hand-1"]);
  expect(
    searchPublicHistoryHands(history, { cards: "a♥ k♠" }).map(
      (hand) => hand.handId,
    ),
  ).toEqual(["hand-1"]);
  expect(
    searchPublicHistoryHands(history, { cards: "Ah Ks", player: "alice" }),
  ).toEqual([]);
  expect(searchPublicHistoryHands(history, { cards: "2s" })).toEqual([]);
  expect(
    searchPublicHistoryHands(history, { player: "ALI" }).map(
      (hand) => hand.handId,
    ),
  ).toEqual(["hand-2"]);
  expect(() =>
    searchPublicHistoryHands(history, { cards: "Ah Ks Qd" }),
  ).toThrow(/at most two/);
});

test("uses inclusive valid date ranges against hand start times", () => {
  const history = parseFixture();
  const firstHandTime = "2026-09-14T10:00:00+08:00";
  expect(
    searchPublicHistoryHands(history, {
      from: firstHandTime,
      to: firstHandTime,
    }).map((hand) => hand.handId),
  ).toEqual(["hand-1"]);
  expect(
    searchPublicHistoryHands(history, {
      from: "2026-09-14",
      to: "2026-09-14",
    }),
  ).toHaveLength(2);
  expect(() =>
    searchPublicHistoryHands(history, {
      from: "2026-09-15T00:00:00Z",
      to: "2026-09-14T00:00:00Z",
    }),
  ).toThrow(/date range/);
  expect(() =>
    searchPublicHistoryHands(history, { from: "2026-02-30" }),
  ).toThrow(/invalid date/);
});

test("uses the earliest hand the player participated in and formats it as UTC", () => {
  const history = parseFixture();
  expect(publicHistoryFilename(history, "alice", "../Alice / Z")).toBe(
    "Alice-Z_2026-09-14_03-00-00Z.json",
  );
  expect(publicHistoryFilename(history, "bob", "Bob")).toBe(
    "Bob_2026-09-14_02-00-00Z.json",
  );
  expect(publicHistoryFilename(history, "missing", "No One")).toBe(
    "No-One_no-hands.json",
  );

  const noHands = parsePublicTableHistory(
    JSON.stringify({
      format: "our-poker-table-public-history",
      version: 1,
      tableId: "table-1",
      exportedAt: "2026-09-14T13:00:00Z",
      completeFromFirstHand: true,
      frames: [
        frame("hand-1", 1, "2026-09-14T10:00:00Z", "StartHand", [
          { ...SEAT_ALICE, status: "sitting-out" },
        ]),
      ],
    }),
  );
  expect(publicHistoryFilename(noHands, "alice", "Alice")).toBe(
    "Alice_no-hands.json",
  );
});

test("rejects hostile prototype fields without exposing untrusted values in errors", () => {
  const text = `{"format":"our-poker-table-public-history","version":1,"tableId":"table","exportedAt":"2026-09-14T00:00:00Z","completeFromFirstHand":true,"frames":[],"__proto__":{"secret":"secret"}}`;
  let caught: unknown;
  try {
    parsePublicTableHistory(text);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).not.toContain("secret");
  expect(({} as { secret?: string }).secret).toBeUndefined();
});

// Keep compile-time pressure on the frozen public-history frame contract.
const _frameContract: PublicHistoryFrame | undefined = parseFixture().frames[0];
void _frameContract;
