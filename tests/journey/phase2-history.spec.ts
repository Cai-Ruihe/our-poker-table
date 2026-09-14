import { readFile } from "node:fs/promises";

import {
  groupPublicHistoryHands,
  parsePublicTableHistory,
  publicHistoryFilename,
  type PublicTableHistory,
} from "@html-poker/game-core";
import {
  expect,
  test,
  type BrowserContext,
  type Download,
  type Locator,
  type Page,
} from "@playwright/test";

import { exerciseControl } from "./control-qa";

interface DownloadedHistory {
  readonly download: Download;
  readonly filename: string;
  readonly history: PublicTableHistory;
}

function control(page: Page, id: string): Locator {
  return page.locator(`[data-qa-control="${id}"]`);
}

async function joinPlayer(
  host: Page,
  context: BrowserContext,
  displayName: string,
): Promise<Page> {
  const invitation = await host
    .getByLabel("Player invitation link")
    .inputValue();
  const player = await context.newPage();
  await player.goto(invitation);
  await player.getByLabel("Display name").fill(displayName);
  await player.getByRole("button", { name: "Join table" }).click();
  await expect(
    player.getByRole("heading", { name: "You have a seat" }),
  ).toBeVisible();
  return player;
}

async function downloadHistory(
  page: Page,
  controlId:
    | "player-history-download"
    | "leave-dialog-download"
    | "host-history-download" = "player-history-download",
  afterDownload?: () => Promise<unknown>,
): Promise<DownloadedHistory> {
  let downloaded: Download | undefined;
  const trigger = async (target: Locator) => {
    const pending = page.waitForEvent("download");
    await target.click();
    downloaded = await pending;
  };
  const verify = async () => {
    if (!downloaded) throw new Error("History download did not start.");
    expect(downloaded.suggestedFilename()).toMatch(/\.json$/u);
    await afterDownload?.();
  };
  if (controlId === "leave-dialog-download") {
    await exerciseControl(
      "leave-dialog-download",
      control(page, controlId),
      trigger,
      verify,
    );
  } else if (controlId === "host-history-download") {
    await exerciseControl(
      "host-history-download",
      control(page, controlId),
      trigger,
      verify,
    );
  } else {
    await exerciseControl(
      "player-history-download",
      control(page, controlId),
      trigger,
      verify,
    );
  }
  if (!downloaded) throw new Error("History download did not finish.");
  const path = await downloaded.path();
  if (!path) throw new Error("Downloaded file is unavailable.");
  return {
    download: downloaded,
    filename: downloaded.suggestedFilename(),
    history: parsePublicTableHistory(await readFile(path, "utf8")),
  };
}

function assertPublicCardChronology(history: PublicTableHistory): void {
  for (const hand of groupPublicHistoryHands(history)) {
    const first = hand.frames[0];
    expect(first?.action.type).toBe("StartHand");
    expect(first?.seats.every((seat) => !seat.holeCards)).toBe(true);

    const exposedSeatIds = new Set<string>();
    for (const frame of hand.frames) {
      if (frame.action.type === "PrepareSettlement") {
        for (const seat of frame.seats) {
          if (seat.holeCards?.length) exposedSeatIds.add(seat.seatId);
        }
      }
      if (frame.action.type === "ShowCards" && frame.action.seatId) {
        exposedSeatIds.add(frame.action.seatId);
      }

      const visibleSeats = frame.seats.filter((seat) => seat.holeCards?.length);
      expect(visibleSeats.map((seat) => seat.seatId).sort()).toEqual(
        [...exposedSeatIds].sort(),
      );
      for (const seat of visibleSeats) expect(seat.holeCards).toHaveLength(2);
    }
  }
  expect(JSON.stringify(history)).not.toMatch(
    /"(?:privateCards|custody|credential|recoveryKey|recordKey|secret)"/iu,
  );
}

test.beforeEach(async ({ context }, testInfo) => {
  if (!testInfo.project.name.startsWith("phase-release")) return;
  // The assembled release journey uses the same local, synthetic transport
  // configuration as the Phase 2 preview journey.
  await context.route("**/poker-config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.__HTML_POKER_CONFIG__ = {};",
    }),
  );
});

test("Phase 2 history downloads, replay, exit, and dissolution preserve public records", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires the assembled Phase 1 and Phase 2 release paths.",
  );

  await host.goto("/multiplayer/");
  await host.getByRole("button", { name: "Create table" }).click();
  const alice = await joinPlayer(host, context, "Alice");
  const bob = await joinPlayer(host, context, "Bob");
  const bobRecoveryUrl = bob.url();

  await host.getByRole("button", { name: "Deal first hand" }).click();
  await expect(alice.locator("[data-private-card]")).toHaveCount(2);
  await expect(bob.locator("[data-private-card]")).toHaveCount(2);
  await expect(host.locator("[data-seat-stack]")).toHaveCount(2);
  await expect
    .poll(() =>
      host
        .locator("[data-seat-stack]")
        .evaluateAll((seats) =>
          seats.map((seat) => seat.getAttribute("data-seat-stack")),
        ),
    )
    .toEqual(["99", "98"]);

  const preflopCaller = alice;
  const preflopChecker = bob;
  await exerciseControl(
    "player-bet-call",
    control(preflopCaller, "player-bet-call"),
    (target) => target.click(),
    () => expect(control(preflopChecker, "player-bet-check")).toBeEnabled(),
  );
  await exerciseControl(
    "player-bet-check",
    control(preflopChecker, "player-bet-check"),
    (target) => target.click(),
    () => expect(host.locator("[data-board-card]")).toHaveCount(3),
  );

  for (const boardCount of [3, 4, 5]) {
    const firstChecker = bob;
    const secondChecker = alice;
    await exerciseControl(
      "player-bet-check",
      control(firstChecker, "player-bet-check"),
      (target) => target.click(),
      () => expect(control(secondChecker, "player-bet-check")).toBeEnabled(),
    );
    await exerciseControl(
      "player-bet-check",
      control(secondChecker, "player-bet-check"),
      (target) => target.click(),
      async () => {
        if (boardCount < 5) {
          await expect(host.locator("[data-board-card]")).toHaveCount(
            boardCount + 1,
          );
        } else {
          await expect(host.locator(".settlement-panel")).toBeVisible();
        }
      },
    );
  }

  const winnerSeat = host.locator(".settlement-panel__winner-hand");
  await expect(winnerSeat.first()).toBeVisible();
  const winnerSeatId = await winnerSeat
    .first()
    .getAttribute("data-settlement-winner-seat");
  if (!winnerSeatId)
    throw new Error("The settlement proposal has no winner seat.");
  await expect(
    winnerSeat.first().locator(".settlement-panel__winner-cards"),
  ).toBeVisible();
  await exerciseControl(
    "dealer-confirm-settlement",
    control(host, "dealer-confirm-settlement"),
    (target) => target.click(),
    () =>
      expect(
        host.getByText("Settlement result", { exact: true }).first(),
      ).toBeVisible(),
  );

  await exerciseControl(
    "dealer-next-hand",
    control(host, "dealer-next-hand"),
    (target) => target.click(),
    async () => {
      await expect(host.locator("[data-board-card]")).toHaveCount(0);
      await expect(control(bob, "player-bet-fold")).toBeEnabled();
    },
  );
  await expect(control(bob, "player-bet-fold")).toBeEnabled();
  await exerciseControl(
    "player-bet-fold",
    control(bob, "player-bet-fold"),
    (target) => target.click(),
    () => expect(host.locator(".settlement-panel")).toBeVisible(),
  );
  await expect(control(alice, "player-show-cards")).toBeEnabled();
  await exerciseControl(
    "player-show-cards",
    control(alice, "player-show-cards"),
    (target) => target.press("End"),
    () => expect(host.locator(".seat-grid [data-shown-card]")).toHaveCount(2),
  );
  await exerciseControl(
    "dealer-confirm-settlement",
    control(host, "dealer-confirm-settlement"),
    (target) => target.click(),
    () =>
      expect(
        host.getByText("Settlement result", { exact: true }).first(),
      ).toBeVisible(),
  );

  const hostHistory = await downloadHistory(host, "host-history-download");
  await exerciseControl(
    "host-history-replay",
    control(host, "host-history-replay"),
    (target) => target.click(),
    () =>
      expect(host.getByRole("heading", { name: "Hand history" })).toBeVisible(),
  );
  await control(host, "history-close").click();
  const aliceHistory = await downloadHistory(alice);
  const bobHistory = await downloadHistory(bob);
  const hands = groupPublicHistoryHands(aliceHistory.history);
  expect(hands).toHaveLength(2);
  expect(hostHistory.history.frames).toEqual(aliceHistory.history.frames);
  expect(aliceHistory.history.frames.length).toBeGreaterThan(10);
  expect(hands[0]?.frames.length).toBeGreaterThan(10);
  expect(
    hands.every((hand) => Number.isFinite(Date.parse(hand.startedAt))),
  ).toBe(true);
  expect(aliceHistory.history.frames).toEqual(bobHistory.history.frames);
  expect(
    aliceHistory.history.frames.some((frame) => frame.action.type === "call"),
  ).toBe(true);
  expect(
    aliceHistory.history.frames.some((frame) => frame.action.type === "check"),
  ).toBe(true);
  expect(
    aliceHistory.history.frames.some((frame) => frame.action.type === "fold"),
  ).toBe(true);
  expect(
    aliceHistory.history.frames.some(
      (frame) => frame.action.type === "ConfirmSettlement",
    ),
  ).toBe(true);
  assertPublicCardChronology(aliceHistory.history);

  const firstHand = hands[0];
  const secondHand = hands[1];
  const firstStart = firstHand?.frames[0];
  const secondStart = secondHand?.frames[0];
  if (!firstStart || !secondStart)
    throw new Error("Both hands need a start frame.");
  const aliceSeatId = firstStart.seats.find(
    (seat) => seat.displayName === "Alice",
  )?.seatId;
  const bobSeatId = firstStart.seats.find(
    (seat) => seat.displayName === "Bob",
  )?.seatId;
  if (!aliceSeatId || !bobSeatId)
    throw new Error("The public history is missing a player seat.");
  expect(firstStart.dealerSeatId).toBe(aliceSeatId);
  expect(secondStart.dealerSeatId).toBe(bobSeatId);

  expect(aliceHistory.filename).toBe(
    publicHistoryFilename(aliceHistory.history, aliceSeatId, "Alice"),
  );
  expect(bobHistory.filename).toBe(
    publicHistoryFilename(bobHistory.history, bobSeatId, "Bob"),
  );
  expect(
    aliceHistory.filename.slice(aliceHistory.filename.indexOf("_") + 1),
  ).toBe(bobHistory.filename.slice(bobHistory.filename.indexOf("_") + 1));

  const home = await context.newPage();
  await home.goto("/multiplayer/");
  await exerciseControl(
    "home-history-replay",
    control(home, "home-history-replay"),
    (target) => target.click(),
    () =>
      expect(home.getByRole("heading", { name: "Hand history" })).toBeVisible(),
  );
  await exerciseControl(
    "history-close",
    control(home, "history-close"),
    (target) => target.click(),
    () =>
      expect(home.getByRole("heading", { name: "Hand history" })).toHaveCount(
        0,
      ),
  );
  await home.close();

  await exerciseControl(
    "player-history-replay",
    control(alice, "player-history-replay"),
    (target) => target.click(),
    () =>
      expect(
        alice.getByRole("heading", { name: "Hand history" }),
      ).toBeVisible(),
  );
  const aliceDownloadPath = await aliceHistory.download.path();
  if (!aliceDownloadPath)
    throw new Error("Alice's history file is unavailable for replay.");
  await exerciseControl(
    "history-import",
    control(alice, "history-import"),
    (target) => target.setInputFiles(aliceDownloadPath),
    () =>
      expect(
        alice.getByText("Imported history · not independently verified"),
      ).toBeVisible(),
  );
  const handSelect = control(alice, "history-hand-select");
  await expect(handSelect).toHaveValue(firstHand.handId);
  await expect(handSelect.locator("option")).toHaveCount(2);

  const firstPublicWinner = firstHand.frames
    .flatMap((frame) => frame.seats)
    .find((seat) => seat.holeCards?.length);
  if (!firstPublicWinner?.holeCards)
    throw new Error("The checkdown did not publish winner cards.");
  await control(alice, "history-search-cards").fill(
    firstPublicWinner.holeCards.join(" "),
  );
  await expect(handSelect.locator("option")).toHaveCount(1);
  await expect(handSelect).toHaveValue(firstHand.handId);
  await control(alice, "history-search-player").fill(
    firstPublicWinner.displayName,
  );
  await expect(handSelect.locator("option")).toHaveCount(1);
  await control(alice, "history-search-cards").fill("");
  await expect(handSelect.locator("option")).toHaveCount(2);
  await expect(handSelect).toHaveValue(firstHand.handId);
  await control(alice, "history-search-from").fill("2099-01-01T00:00");
  await control(alice, "history-search-to").fill("2099-01-01T23:59");
  await expect(handSelect.locator("option")).toHaveCount(0);
  await exerciseControl(
    "history-search-clear",
    control(alice, "history-search-clear"),
    (target) => target.click(),
    () => expect(handSelect.locator("option")).toHaveCount(2),
  );

  await exerciseControl(
    "history-hand-select",
    handSelect,
    (target) => target.selectOption(secondHand.handId),
    async () => {
      await expect(handSelect).toHaveValue(secondHand.handId);
      await expect(
        alice.locator(".history-replay__seat-cards [data-history-public-card]"),
      ).toHaveCount(0);
    },
  );
  await exerciseControl(
    "history-hand-select",
    handSelect,
    (target) => target.selectOption(firstHand.handId),
    () => expect(handSelect).toHaveValue(firstHand.handId),
  );
  const finalShownCount =
    firstHand.frames
      .at(-1)
      ?.seats.reduce((sum, seat) => sum + (seat.holeCards?.length ?? 0), 0) ??
    0;
  const replayFrame = alice.locator("[data-history-frame-revision]");
  await expect(replayFrame).toHaveAttribute(
    "data-history-frame-revision",
    String(firstHand.frames[0]?.revision),
  );
  await expect(
    alice.locator(".history-replay__board [data-history-public-card]"),
  ).toHaveCount(0);
  await expect(
    alice.locator(".history-replay__seat-cards [data-history-public-card]"),
  ).toHaveCount(0);
  await exerciseControl(
    "history-step-next",
    control(alice, "history-step-next"),
    (target) => target.click(),
    () =>
      expect(replayFrame).toHaveAttribute(
        "data-history-frame-revision",
        String(firstHand.frames[1]?.revision),
      ),
  );
  await alice.screenshot({
    path: testInfo.outputPath("history-replay.png"),
    fullPage: true,
  });
  await exerciseControl(
    "history-step-prev",
    control(alice, "history-step-prev"),
    (target) => target.click(),
    () =>
      expect(replayFrame).toHaveAttribute(
        "data-history-frame-revision",
        String(firstHand.frames[0]?.revision),
      ),
  );
  await exerciseControl(
    "history-step-range",
    control(alice, "history-step-range"),
    (target) => target.press("End"),
    async () => {
      await expect(replayFrame).toHaveAttribute(
        "data-history-frame-revision",
        String(firstHand.frames.at(-1)?.revision),
      );
      await expect(
        alice.locator(".history-replay__seat-cards [data-history-public-card]"),
      ).toHaveCount(finalShownCount);
    },
  );
  await exerciseControl(
    "history-step-prev",
    control(alice, "history-step-prev"),
    (target) => target.click(),
    async () => {
      await expect(replayFrame).toHaveAttribute(
        "data-history-frame-revision",
        String(firstHand.frames.at(-2)?.revision),
      );
      await expect(
        alice.locator(".history-replay__seat-cards [data-history-public-card]"),
      ).toHaveCount(finalShownCount);
    },
  );
  await exerciseControl(
    "history-step-prev",
    control(alice, "history-step-prev"),
    (target) => target.click(),
    async () => {
      await expect(replayFrame).toHaveAttribute(
        "data-history-frame-revision",
        String(firstHand.frames.at(-3)?.revision),
      );
      await expect(
        alice.locator(".history-replay__seat-cards [data-history-public-card]"),
      ).toHaveCount(0);
    },
  );
  await exerciseControl(
    "history-step-next",
    control(alice, "history-step-next"),
    (target) => target.click(),
    () =>
      expect(
        alice.locator(".history-replay__seat-cards [data-history-public-card]"),
      ).toHaveCount(finalShownCount),
  );
  await exerciseControl(
    "history-close",
    control(alice, "history-close"),
    (target) => target.click(),
    () => expect(control(alice, "player-history-download")).toBeVisible(),
  );

  await exerciseControl(
    "player-exit-page",
    control(alice, "player-exit-page"),
    (target) => target.click(),
    () =>
      expect(
        alice.getByRole("dialog", { name: "Leave this table?" }),
      ).toBeVisible(),
  );
  await expect(control(alice, "leave-dialog-download")).toBeVisible();
  await expect(control(alice, "leave-dialog-confirm")).toBeVisible();
  await exerciseControl(
    "leave-dialog-cancel",
    control(alice, "leave-dialog-cancel"),
    (target) => target.click(),
    () => expect(control(alice, "player-history-download")).toBeVisible(),
  );

  await exerciseControl(
    "player-exit-page",
    control(bob, "player-exit-page"),
    (target) => target.click(),
    () =>
      expect(
        bob.getByRole("dialog", { name: "Leave this table?" }),
      ).toBeVisible(),
  );
  const bobLeaveDownload = await downloadHistory(
    bob,
    "leave-dialog-download",
    async () =>
      expect(bob.getByRole("button", { name: "Create table" })).toBeVisible(),
  );
  expect(bobLeaveDownload.filename).toBe(bobHistory.filename);
  await bob.goto(bobRecoveryUrl);
  await bob.reload();
  await expect(control(bob, "player-history-download")).toBeVisible();

  // Delay one final-save acknowledgement to reproduce a host refresh halfway
  // through dissolution. Only synthetic test messages are intercepted.
  await bob.evaluate(() => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    crypto.subtle.encrypt = async (algorithm, key, data) => {
      const text = new TextDecoder().decode(data);
      if (
        text.includes('"type":"history-saved"') &&
        !document.documentElement.dataset.releaseHistoryAck
      ) {
        document.documentElement.dataset.historyAckPaused = "true";
        await new Promise<void>((resolve) => {
          const timer = setInterval(() => {
            if (document.documentElement.dataset.releaseHistoryAck) {
              clearInterval(timer);
              resolve();
            }
          }, 25);
        });
      }
      return encrypt(algorithm, key, data);
    };
  });
  await exerciseControl(
    "host-root-controls-open",
    control(host, "host-root-controls-open"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", { name: "Table control center" }),
      ).toBeVisible(),
  );
  host.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await control(host, "host-dissolve-table").click();
  await expect(
    alice.getByRole("heading", { name: "Table dissolved" }),
  ).toBeVisible();
  await expect(bob.locator("html")).toHaveAttribute(
    "data-history-ack-paused",
    "true",
  );
  await host.reload();
  await control(host, "host-root-controls-open").click();
  await exerciseControl(
    "host-dissolve-table",
    control(host, "host-dissolve-table"),
    async (target) => {
      host.once("dialog", (dialog) => {
        void dialog.accept();
      });
      await target.click();
      await bob.evaluate(() => {
        document.documentElement.dataset.releaseHistoryAck = "true";
      });
    },
    () =>
      expect(host.getByRole("button", { name: "Create table" })).toBeVisible({
        timeout: 15000,
      }),
  );
  await host.goto("about:blank");

  await expect(
    alice.getByRole("heading", { name: "Table dissolved" }),
  ).toBeVisible();
  await expect(
    bob.getByRole("heading", { name: "Table dissolved" }),
  ).toBeVisible();
  const aliceFinal = await downloadHistory(alice);
  const bobFinal = await downloadHistory(bob);
  expect(aliceFinal.history.frames).toEqual(aliceHistory.history.frames);
  expect(bobFinal.history.frames).toEqual(bobHistory.history.frames);

  await alice.reload();
  await bob.reload();
  await expect(
    alice.getByRole("heading", { name: "Table dissolved" }),
  ).toBeVisible();
  await expect(
    bob.getByRole("heading", { name: "Table dissolved" }),
  ).toBeVisible();
  const aliceReloaded = await downloadHistory(alice);
  const bobReloaded = await downloadHistory(bob);
  expect(aliceReloaded.history.frames).toEqual(aliceHistory.history.frames);
  expect(bobReloaded.history.frames).toEqual(bobHistory.history.frames);
});

test("Phase 2 local replay rejects malformed imports and pages long records", async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires packaged replay.",
  );
  await page.goto("/multiplayer/?replay=1");
  await expect(
    page.getByRole("heading", { name: "Hand history" }),
  ).toBeVisible();
  const history: PublicTableHistory = {
    format: "our-poker-table-public-history",
    version: 1,
    tableId: "synthetic-replay",
    exportedAt: "2026-09-14T13:00:00.000Z",
    completeFromFirstHand: true,
    frames: Array.from({ length: 51 }, (_, index) => ({
      handId: `hand-${index + 1}`,
      revision: index + 1,
      at: new Date(Date.UTC(2026, 8, 14, 12, index)).toISOString(),
      phase: "preflop",
      action: { type: "StartHand" },
      events: [],
      dealerSeatId: "alice",
      board: [],
      seats: [
        {
          seatId: "alice",
          displayName: "Alice <img src=x onerror=alert(1)>",
          status: "active",
          stack: 100,
        },
      ],
      potTotal: 0,
    })),
  };
  await control(page, "history-import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"privateCards":["As"]}'),
  });
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await control(page, "history-import").setInputFiles({
    name: "synthetic-public-history.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(history)),
  });
  const select = control(page, "history-hand-select");
  await expect(select.locator("option")).toHaveCount(50);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".history-replay__seat img")).toHaveCount(0);
  await expect(page.locator(".history-replay__seat")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  await exerciseControl(
    "history-show-more",
    control(page, "history-show-more"),
    (target) => target.click(),
    () => expect(select.locator("option")).toHaveCount(51),
  );
  await select.selectOption("hand-51");
  await expect(page.locator("[data-history-frame-revision]")).toHaveAttribute(
    "data-history-frame-revision",
    "51",
  );
  await control(page, "history-search-cards").fill("not-a-card");
  await expect(page.getByRole("alert")).toContainText("valid cards");
  await control(page, "history-search-clear").click();
  await page.screenshot({
    path: testInfo.outputPath("history-replay-long-record.png"),
    fullPage: true,
  });
});
