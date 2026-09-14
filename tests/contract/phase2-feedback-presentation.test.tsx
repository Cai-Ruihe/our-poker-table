import { createElement } from "../../apps/web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../apps/web/node_modules/react-dom/server.js";
import type { PublicProjection, SeatProjection } from "@html-poker/game-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LanguageProvider,
  localizeRuntimeError,
  TableSurface,
} from "../../packages/presentation/src/index";

function projection(
  phase: PublicProjection["phase"] = "preflop",
  accountingPhase: NonNullable<
    PublicProjection["accounting"]
  >["phase"] = "betting",
): PublicProjection {
  return {
    accounting: {
      currentBet: 4,
      currentActorSeatId: accountingPhase === "betting" ? "bob" : undefined,
      phase: accountingPhase,
      potTotal: 12,
      seats: [
        {
          seatId: "alice",
          stack: 100,
          status: "active",
          streetContribution: 2,
          totalContribution: 2,
        },
        {
          seatId: "bob",
          stack: 0,
          status: "all-in",
          streetContribution: 4,
          totalContribution: 4,
        },
      ],
      sessionTotal: 100,
    },
    board: ["As", "Kd", "Qc"],
    cardStyle: "classic",
    dealerSeatId: "alice",
    phase,
    revision: 8,
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
        status: "waiting",
      },
    ],
    tableTheme: "dark-green",
    tableId: "table-1",
    view: "public",
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

afterEach(() => vi.unstubAllGlobals());

describe("Phase 2 presentation feedback", () => {
  it("places the pot after the community rail and keeps every authoritative stack visible", () => {
    const markup = renderSurface({ mode: "public", projection: projection() });
    expect(
      markup.indexOf('class="dealer-rail dealer-rail--with-pot"'),
    ).toBeLessThan(markup.indexOf("data-table-pot"));
    expect(markup).toContain(
      'data-seat-id="alice" data-seat-acting="false" data-seat-stack="100"',
    );
    expect(markup).toContain(
      'data-seat-id="bob" data-seat-acting="true" data-seat-stack="0"',
    );
    expect(markup).toContain('data-seat-stack="unknown"');
    expect(markup).toContain("To act");
    expect(markup).toContain("Pot</span><strong>12</strong>");
  });

  it("shows stacks in the player view and clears the actor after settlement", () => {
    const complete = projection("complete", "complete");
    const seatProjection: SeatProjection = {
      ...complete,
      self: { holeCards: ["Ah", "Ad"], seatId: "alice", status: "active" },
      view: "seat",
    };
    const markup = renderSurface({
      mode: "player",
      projection: seatProjection,
    });
    expect(markup).toContain("data-player-stack-list");
    expect(markup).toContain('data-seat-id="alice" data-seat-stack="100"');
    expect(markup).toContain('data-seat-id="bob" data-seat-stack="0"');
    expect(markup).toContain('data-seat-id="cara" data-seat-stack="unknown"');
    expect(markup).not.toContain('data-seat-acting="true"');
  });

  it("uses classified recovery and translates known digital rejections", () => {
    const seatProjection: SeatProjection = {
      ...projection(),
      self: { holeCards: ["Ah", "Ad"], seatId: "alice", status: "active" },
      view: "seat",
    };
    const markup = renderSurface({
      errorMessage: "End hand rejected: command-not-allowed",
      errorRecovery: "none",
      mode: "player",
      onReconnect: () => true,
      projection: seatProjection,
    });
    expect(markup).toContain("the host cannot end it manually");
    expect(markup).not.toContain('data-qa-control="table-reconnect"');
    expect(
      localizeRuntimeError("zh", "Chip top-up rejected: table-not-complete"),
    ).toBe("筹码补充未获接受。请检查数量和玩家可用筹码。");
  });
});
