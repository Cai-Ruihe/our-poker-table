import { createElement } from "../../apps/web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../apps/web/node_modules/react-dom/server.js";
import type { PublicProjection, SeatProjection } from "@html-poker/game-core";
import { describe, expect, it, vi } from "vitest";
import {
  LanguageProvider,
  TableSurface,
} from "../../packages/presentation/src/index";

type AccountingPhase = NonNullable<PublicProjection["accounting"]>["phase"];

function projection(
  phase: PublicProjection["phase"] = "settlement-pending",
  accountingPhase: AccountingPhase = "settlement-pending",
): PublicProjection {
  const settlement =
    accountingPhase === "settlement-pending" || accountingPhase === "complete"
      ? {
          pots: [
            {
              amount: 20,
              awards: [{ amount: 20, seatId: "alice" }],
              eligibleSeatIds: ["alice", "bob"],
              explanation: "Main pot",
              winnerSeatIds: ["alice"],
            },
          ],
          totalPot: 20,
        }
      : undefined;
  return {
    accounting: {
      currentBet: 0,
      phase: accountingPhase,
      potTotal: 20,
      seats: [
        {
          seatId: "alice",
          stack: 80,
          status: "active",
          streetContribution: 0,
          totalContribution: 10,
        },
        {
          seatId: "bob",
          stack: 0,
          status: "all-in",
          streetContribution: 0,
          totalContribution: 10,
        },
        {
          seatId: "cara",
          stack: 20,
          status: "folded",
          streetContribution: 0,
          totalContribution: 10,
        },
      ],
      sessionTotal: 100,
      ...(settlement ? { settlement } : {}),
    },
    board: ["2c", "7d", "9h"],
    cardStyle: "classic",
    dealerSeatId: "alice",
    phase,
    revision: 12,
    rulesProfileId: "nlhe-home-v1",
    seats: [
      {
        connected: true,
        displayName: "Alice",
        displayPosition: 0,
        seatId: "alice",
        status: "active",
      },
      {
        connected: true,
        displayName: "Bob",
        displayPosition: 1,
        seatId: "bob",
        status: "active",
      },
      {
        connected: true,
        displayName: "Cara",
        displayPosition: 2,
        seatId: "cara",
        status: "folded",
      },
    ],
    showdown: {
      evaluatedSeatIds: ["alice", "bob"],
      leaders: ["alice", "bob"],
      status: "complete",
    },
    tableTheme: "dark-green",
    tableId: "table-1",
    view: "public",
  };
}

function seatProjection(
  value: PublicProjection,
  status: SeatProjection["self"]["status"] = "active",
  accountingStatus: NonNullable<
    PublicProjection["accounting"]
  >["seats"][number]["status"] = "active",
): SeatProjection {
  if (!value.accounting) throw new Error("Accounting fixture required");
  return {
    ...value,
    accounting: {
      ...value.accounting,
      seats: value.accounting.seats.map((seat) =>
        seat.seatId === "alice" ? { ...seat, status: accountingStatus } : seat,
      ),
    },
    self: { holeCards: ["Qh", "Qc"], seatId: "alice", status },
    view: "seat",
  };
}

function renderSurface(
  props: Partial<React.ComponentProps<typeof TableSurface>> &
    Pick<React.ComponentProps<typeof TableSurface>, "mode" | "projection">,
): string {
  vi.stubGlobal("location", { href: "https://table.example/?lang=en" });
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      null,
      createElement(TableSurface, {
        brandSymbolSrc: "brand.svg",
        busy: false,
        connectionLabel: "Connected",
        productName: "Our Poker Table",
        ...props,
      }),
    ),
  );
}

describe("Phase 2 revision 3 presentation feedback", () => {
  it("shows only already-public winner cards during settlement", () => {
    const value = projection();
    const shownWinner: PublicProjection = {
      ...value,
      seats: value.seats.map((seat) =>
        seat.seatId === "alice"
          ? {
              ...seat,
              evaluation: {
                bestFive: ["Ah", "Ad", "2c", "7d", "9h"],
                category: "pair",
                label: "Pair of Aces",
                score: [1, 14, 9, 7, 2],
              },
              holeCards: ["Ah", "Ad"],
              status: "shown",
            }
          : seat,
      ),
    };
    const markup = renderSurface({ mode: "public", projection: shownWinner });
    expect(markup.match(/data-shown-card="true"/gu)).toHaveLength(2);
    expect(markup).toContain('data-seat-settlement-winner="true"');
    expect(markup).toContain('data-card="Ah"');
    expect(markup).toContain('data-card="Ad"');
    expect(markup.match(/data-settlement-winner-card="true"/gu)).toBeNull();
    const bobSeat = markup.match(/<div[^>]*data-seat-id="bob"[^>]*>/u)?.[0];
    expect(bobSeat).not.toContain('data-seat-settlement-winner="true"');

    const privateSeatView = seatProjection(value);
    const publicMarkup = renderSurface({
      mode: "public",
      projection: privateSeatView,
    });
    expect(publicMarkup).not.toContain('data-card="Qh"');
    expect(publicMarkup).not.toContain('data-card="Qc"');
  });

  it("marks the player's stack, fades folded stacks, and labels all-in seats", () => {
    const markup = renderSurface({
      mode: "player",
      projection: seatProjection(projection("river", "betting")),
    });
    expect(markup).toContain("data-player-stack-list");
    expect(markup).toContain(
      'class="player-stack-list__seat player-stack-list__seat--self"',
    );
    expect(markup).toContain('data-seat-id="alice" data-seat-stack="80"');
    expect(markup).toContain('data-seat-accounting-status="folded"');
    expect(markup).toContain('data-seat-all-in="true"');
    expect(markup).toContain("All-in");
  });

  it("keeps digital Show deliberate and gates it to an active, unshown seat", () => {
    const betting = renderSurface({
      mode: "player",
      onShowCards: () => undefined,
      projection: seatProjection(projection("river", "betting")),
    });
    expect(betting).toContain('data-qa-control="player-show-cards"');
    expect(betting).toContain('aria-disabled="true"');
    expect(betting).toContain("Available after betting closes.");

    const showdown = renderSurface({
      mode: "player",
      onShowCards: () => undefined,
      projection: seatProjection(projection("showdown", "showdown")),
    });
    expect(showdown).toContain('data-qa-control="player-show-cards"');
    expect(showdown).toContain('aria-disabled="false"');

    const complete = renderSurface({
      mode: "player",
      onShowCards: () => undefined,
      projection: seatProjection(projection("complete", "complete")),
    });
    expect(complete).not.toContain('data-qa-control="player-show-cards"');

    const settlementPending = renderSurface({
      mode: "player",
      onShowCards: () => undefined,
      projection: seatProjection(projection("settlement-pending"), "active"),
    });
    expect(settlementPending).toContain('data-qa-control="player-show-cards"');
    expect(settlementPending).toContain('aria-disabled="false"');

    const legacyMucked = renderSurface({
      mode: "player",
      onShowCards: () => undefined,
      projection: seatProjection(
        projection("settlement-pending"),
        "mucked",
        "active",
      ),
    });
    expect(legacyMucked).toContain('data-qa-control="player-show-cards"');
    expect(legacyMucked).toContain('aria-disabled="false"');

    const folded = renderSurface({
      mode: "player",
      onShowCards: () => undefined,
      projection: seatProjection(
        projection("settlement-pending"),
        "active",
        "folded",
      ),
    });
    expect(folded).not.toContain('data-qa-control="player-show-cards"');
  });

  it("places one direct host confirmation beside the runtime settlement proposal", () => {
    const markup = renderSurface({
      mode: "host",
      onConfirmSettlement: () => true,
      projection: projection(),
    });
    const confirmationButtons = markup.match(
      /<button[^>]*data-qa-control="dealer-confirm-settlement"[^>]*>/gu,
    );
    expect(confirmationButtons).toHaveLength(1);
    expect(confirmationButtons?.[0]).not.toContain("disabled");
    expect(markup.indexOf('class="settlement-panel"')).toBeLessThan(
      markup.indexOf('data-qa-control="dealer-confirm-settlement"'),
    );
    expect(markup).toContain("Main pot");
    expect(markup).toContain("Alice +20");
    expect(markup).toContain("Total pot 20");
  });

  it("exposes the same direct confirmation on the tablet view", () => {
    const markup = renderSurface({
      mode: "tablet",
      onConfirmSettlement: () => true,
      projection: projection(),
    });
    expect(
      markup.match(
        /<button[^>]*data-qa-control="dealer-confirm-settlement"[^>]*>/gu,
      ),
    ).toHaveLength(1);
    expect(markup.indexOf('class="settlement-panel"')).toBeLessThan(
      markup.indexOf('data-qa-control="dealer-confirm-settlement"'),
    );
  });

  it("uses the approved Phase 2 canonical corner module four times", () => {
    const markup = renderSurface({ mode: "tablet", projection: projection() });
    expect(markup.match(/data-table-corner-glyph="true"/gu)).toHaveLength(4);
    expect(markup.match(/class="table-corner__canonical"/gu)).toHaveLength(4);
    expect(
      markup.match(
        /<path d="M145 44H186\.586A25\.414 25\.414 0 0 1 212 69\.414V110\.422"><\/path>/gu,
      ),
    ).toHaveLength(4);
    expect(
      markup.match(/<circle cx="212" cy="122" r="6"><\/circle>/gu),
    ).toHaveLength(4);
  });
});
