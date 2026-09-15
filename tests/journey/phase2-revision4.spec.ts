import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { exerciseControl } from "./control-qa";

function control(page: Page, id: string) {
  return page.locator(`[data-qa-control="${id}"]`);
}

async function joinPlayers(
  host: Page,
  context: BrowserContext,
  names: readonly string[],
): Promise<Page[]> {
  const players: Page[] = [];
  for (const name of names) {
    const invitation = await host
      .getByLabel("Player invitation link")
      .inputValue();
    const player = await context.newPage();
    // Wait for the join UI below, rather than every background page resource.
    await player.goto(invitation, { waitUntil: "domcontentloaded" });
    await player.getByLabel("Display name").fill(name);
    await player.getByRole("button", { name: "Join table" }).click();
    await expect(
      player.getByRole("heading", { name: "You have a seat" }),
    ).toBeVisible();
    players.push(player);
  }
  return players;
}

async function createDigitalTable(
  host: Page,
  context: BrowserContext,
  names: readonly string[],
): Promise<Page[]> {
  await host.goto("/multiplayer/");
  await expect(control(host, "home-chip-mode-digital")).toBeChecked();
  await host.getByRole("button", { name: "Create table" }).click();
  return joinPlayers(host, context, names);
}

async function assertNoOverlap(
  page: Page,
  selector: string,
  label: string,
): Promise<void> {
  const collisions = await page.locator(selector).evaluateAll((nodes) => {
    const boxes = nodes
      .map((node) => {
        const box = node.getBoundingClientRect();
        return {
          id: node.getAttribute("data-seat-id") ?? node.className,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        };
      })
      .filter((box) => box.width > 0 && box.height > 0);
    const result: string[] = [];
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left];
        const b = boxes[right];
        if (!a || !b) continue;
        if (
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top
        ) {
          result.push(`${a.id} overlaps ${b.id}`);
        }
      }
    }
    return result;
  });
  expect(collisions, `${label} has overlapping regions`).toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(
    page.locator("body"),
    `${label} body must remain visible`,
  ).toBeVisible();
}

async function assertRegionsDoNotOverlap(
  page: Page,
  selector: string,
  label: string,
): Promise<void> {
  const collisions = await page.locator(selector).evaluateAll((nodes) => {
    const regions = nodes
      .map((node) => {
        const box = node.getBoundingClientRect();
        return {
          name: node.getAttribute("aria-label") ?? node.className,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        };
      })
      .filter((region) => region.width > 0 && region.height > 0);
    const result: string[] = [];
    for (let left = 0; left < regions.length; left += 1) {
      for (let right = left + 1; right < regions.length; right += 1) {
        const a = regions[left];
        const b = regions[right];
        if (!a || !b) continue;
        if (
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top
        ) {
          result.push(`${a.name} overlaps ${b.name}`);
        }
      }
    }
    return result;
  });
  expect(collisions, `${label} has overlapping regions`).toEqual([]);
}

async function switchToHostFromTable(page: Page): Promise<void> {
  await control(page, "tablet-corner-open").last().click();
  await control(page, "tablet-quick-more").click();
  await control(page, "tablet-view-host").click();
  await expect(control(page, "device-view-host")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function clickFirstAvailableAction(page: Page): Promise<void> {
  const action = page
    .locator(
      '[data-qa-control="player-bet-check"], [data-qa-control="player-bet-call"]',
    )
    .first();
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
  await expect(action).not.toHaveAttribute("aria-disabled", "true");
  await action.click();
}

async function reachShowdown(
  host: Page,
  players: readonly Page[],
  showEveryone = true,
  allInRunout = false,
): Promise<void> {
  const seatIds = await Promise.all(
    players.map((player) =>
      player
        .locator('[data-player-stack-list] [data-seat-self="true"]')
        .getAttribute("data-seat-id"),
    ),
  );
  if (seatIds.some((seatId) => !seatId))
    throw new Error("Every player needs a stable seat identity.");
  const bySeat = new Map(
    seatIds.map((seatId, index) => [seatId as string, players[index] as Page]),
  );
  for (let turn = 0; turn < 200; turn += 1) {
    if ((await host.locator(".settlement-panel").count()) > 0) break;
    const actorId = await host
      .locator('[data-seat-acting="true"]')
      .getAttribute("data-seat-id");
    const actor = actorId ? bySeat.get(actorId) : undefined;
    if (!actor)
      throw new Error("The acting seat did not map to a player page.");
    const revision = host.locator(".table-status > span").first();
    const before = await revision.textContent();
    if (allInRunout) {
      await expect(
        actor
          .locator(
            '[data-qa-control="player-bet-check"], [data-qa-control="player-bet-call"]',
          )
          .first(),
      ).toBeVisible();
      const shove = control(actor, "player-bet-all-in");
      if (await shove.count()) await shove.click();
      else await clickFirstAvailableAction(actor);
    } else {
      await clickFirstAvailableAction(actor);
    }
    await expect(revision).not.toHaveText(before ?? "");
  }
  await expect(host.locator(".settlement-panel")).toBeVisible();
  if (!showEveryone) return;
  for (const player of players) {
    const show = control(player, "player-show-cards");
    if ((await show.count()) === 0) continue;
    if ((await show.getAttribute("aria-disabled")) === "true") continue;
    await show.press("End");
  }
  await expect(host.locator(".seat-grid [data-shown-card]")).toHaveCount(
    players.length * 2,
  );
}

test.beforeEach(async ({ context }, testInfo) => {
  if (!testInfo.project.name.startsWith("phase-release")) return;
  await context.route("**/poker-config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.__HTML_POKER_CONFIG__ = {};",
    }),
  );
});

test("revision 4 uses the approved digital defaults and published product copy", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires the assembled Phase 2 release path.",
  );
  const bodyBefore = await host.locator("body").innerText();
  expect(bodyBefore).not.toMatch(/\b(?:Phase [123]|preview|development)\b/iu);
  const [alice, bob] = await createDigitalTable(host, context, [
    "Alice",
    "Bob",
  ]);
  if (!alice || !bob) throw new Error("Two player fixtures required");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await expect(host.locator("[data-table-pot]")).toContainText("15");
  const stacks = await host
    .locator("[data-seat-stack]")
    .evaluateAll((nodes) =>
      nodes.map((node) => Number(node.getAttribute("data-seat-stack"))),
    );
  expect(stacks.sort((a, b) => a - b)).toEqual([990, 995]);
  const bodyAfter = await host.locator("body").innerText();
  expect(bodyAfter).not.toMatch(/\b(?:Phase [123]|preview|development)\b/iu);
});

test("Host, Table, and TV tabs switch projection without authority or privacy changes", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires the assembled Phase 2 release path.",
  );
  const [alice] = await createDigitalTable(host, context, ["Alice", "Bob"]);
  if (!alice) throw new Error("Player fixture required");
  await host.getByRole("button", { name: "Deal first hand" }).click();

  await control(host, "device-view-host").click();
  await expect(control(host, "device-view-host")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await control(host, "device-view-tablet").click();
  await expect(host.locator(".table-surface--tablet")).toBeVisible();
  await expect(control(host, "device-view-tablet")).toHaveCount(0);
  await expect(host.locator("[data-private-card]")).toHaveCount(0);

  await switchToHostFromTable(host);
  await exerciseControl(
    "device-view-tv",
    control(host, "device-view-tv"),
    (target) => target.click(),
    () => expect(host.locator(".table-surface--tv")).toBeVisible(),
  );
  await expect(control(host, "device-view-tv")).toHaveCount(0);
  await expect(host.locator("[data-private-card]")).toHaveCount(0);
});

for (const seatCount of [2, 6, 10]) {
  test(`Table and TV show every player without overlap at ${seatCount} seats`, async ({
    context,
    page: host,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("phase-release"),
      "Requires the assembled Phase 2 release path.",
    );
    // Ten browser clients perform a complete hand serially on mobile WebKit.
    test.setTimeout(120_000);
    const names = Array.from(
      { length: seatCount },
      (_, index) => `Player ${index + 1}`,
    );
    const players = await createDigitalTable(host, context, names);
    await host.getByRole("button", { name: "Deal first hand" }).click();
    // Capacity geometry uses a real all-in runout; full street-by-street
    // betting remains covered by the history and winner journeys.
    await reachShowdown(host, players, true, true);

    for (const view of ["tablet", "tv"] as const) {
      if (view === "tablet") {
        await control(host, "device-view-tablet").click();
      } else {
        await switchToHostFromTable(host);
        await exerciseControl(
          "device-view-tv",
          control(host, "device-view-tv"),
          (target) => target.click(),
          () => expect(host.locator(".table-surface--tv")).toBeVisible(),
        );
      }
      await expect(host.locator(`.table-surface--${view}`)).toBeVisible();
      const surface = `.table-surface--${view}`;
      await expect(host.locator(`${surface} [data-seat-id]`)).toHaveCount(
        seatCount,
      );
      await assertNoOverlap(
        host,
        `${surface} [data-seat-id]`,
        `${view} ${seatCount}-seat table`,
      );
      await assertRegionsDoNotOverlap(
        host,
        `${surface} [data-seat-id], ${surface} .chip-rail, ${surface} .dealer-rail__cards, ${surface} [data-table-pot], ${surface} .settlement-panel`,
        `${view} seats, street, board, pot, and settlement`,
      );
      const street = await host.locator(`${surface} .chip-rail`).boundingBox();
      const board = await host
        .locator(`${surface} .dealer-rail__cards`)
        .boundingBox();
      if (!street || !board)
        throw new Error(`${view} street and board must be measurable`);
      expect(street.y + street.height).toBeLessThanOrEqual(board.y);
      await expect(host.locator(`${surface} [data-shown-card]`)).toHaveCount(
        seatCount * 2,
      );
      await assertNoHorizontalOverflow(host, `${view} ${seatCount}-seat table`);
      await host.screenshot({
        path: testInfo.outputPath(`revision4-${view}-${seatCount}-seats.png`),
        fullPage: true,
      });
    }
  });
}

test("settlement exposes public winner cards once at the seat and keeps a fold-win private", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires the assembled Phase 2 release path.",
  );
  const [alice, bob] = await createDigitalTable(host, context, [
    "Alice",
    "Bob",
  ]);
  if (!alice || !bob) throw new Error("Two player fixtures required");
  await host.getByRole("button", { name: "Deal first hand" }).click();

  await reachShowdown(host, [alice, bob], false);
  await control(host, "device-view-tablet").click();
  const winner = host.locator('[data-seat-settlement-winner="true"]').first();
  await expect(winner).toBeVisible();
  const winnerId = await winner.getAttribute("data-seat-id");
  if (!winnerId) throw new Error("Settlement winner seat is missing");
  await expect(host.locator(".settlement-panel [data-card]")).toHaveCount(0);
  await expect(
    host.locator(`[data-seat-id="${winnerId}"] [data-shown-card]`),
  ).toHaveCount(2);

  // A fold-win has no public winner-card authorization until deliberate Show.
  await control(host, "dealer-confirm-settlement").click();
  await expect(
    host.getByText("Settlement result", { exact: true }).first(),
  ).toBeVisible();
  await control(host, "tablet-corner-open").last().click();
  const completeBox = await host
    .locator(".tablet-digital-progress")
    .boundingBox();
  const nextBox = await host
    .locator(".tablet-quick-panel .next-hand-control")
    .boundingBox();
  if (!completeBox || !nextBox)
    throw new Error("Completed hand controls must be visible.");
  if ((host.viewportSize()?.width ?? 1280) <= 760) {
    expect(Math.abs(completeBox.x - nextBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(completeBox.width - nextBox.width)).toBeLessThanOrEqual(1);
    expect(completeBox.y + completeBox.height).toBeLessThanOrEqual(nextBox.y);
  } else {
    expect(
      Math.abs(
        completeBox.y + completeBox.height / 2 - nextBox.y - nextBox.height / 2,
      ),
    ).toBeLessThanOrEqual(1);
  }
  await control(host, "tablet-quick-more").click();
  await control(host, "tablet-view-host").click();
  await control(host, "dealer-next-hand").click();
  await expect(host.locator("[data-board-card]")).toHaveCount(0);
  await bob.locator('[data-qa-control="player-bet-fold"]').click();
  await expect(host.locator(".settlement-panel")).toBeVisible();
  const foldWinner = host
    .locator('[data-seat-settlement-winner="true"]')
    .first();
  const foldWinnerId = await foldWinner.getAttribute("data-seat-id");
  if (!foldWinnerId) throw new Error("Fold winner seat is missing");
  await expect(
    host.locator(`[data-seat-id="${foldWinnerId}"] [data-shown-card]`),
  ).toHaveCount(0);
  await expect(host.locator(".settlement-panel [data-card]")).toHaveCount(0);
});

test("history replay uses canonical cards and keeps filter boxes readable", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires the assembled Phase 2 release path.",
  );
  const [alice, bob] = await createDigitalTable(host, context, [
    "Alice",
    "Bob",
  ]);
  if (!alice || !bob) throw new Error("Two player fixtures required");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await reachShowdown(host, [alice, bob], false);
  await control(host, "dealer-confirm-settlement").click();
  await expect(
    host.getByText("Settlement result", { exact: true }).first(),
  ).toBeVisible();
  await control(host, "dealer-next-hand").click();
  await expect(host.locator("[data-board-card]")).toHaveCount(0);
  await bob.locator('[data-qa-control="player-bet-fold"]').click();
  await alice.locator('[data-qa-control="player-show-cards"]').press("End");
  await control(host, "dealer-confirm-settlement").click();
  await expect(
    host.getByText("Settlement result", { exact: true }).first(),
  ).toBeVisible();
  const historyDownload = host.waitForEvent("download");
  await exerciseControl(
    "host-history-download",
    control(host, "host-history-download"),
    (target) => target.click(),
    async () => {
      const download = await historyDownload;
      expect(download.suggestedFilename()).toMatch(/\.json$/u);
    },
  );
  const downloadedHistory = await historyDownload;
  const historyPath = await downloadedHistory.path();
  if (!historyPath) throw new Error("Downloaded public history has no path.");
  await exerciseControl(
    "host-history-replay",
    control(host, "host-history-replay"),
    (target) => target.click(),
    () =>
      expect(host.getByRole("heading", { name: "Hand history" })).toBeVisible(),
  );
  await control(host, "history-import").setInputFiles(historyPath);
  const firstHand = await control(host, "history-hand-select")
    .locator("option")
    .filter({ hasText: /^Hand 1 ·/u })
    .getAttribute("value");
  if (!firstHand) throw new Error("First hand missing from exported history");
  await control(host, "history-hand-select").selectOption(firstHand);
  await control(host, "history-step-range").press("End");
  const replay = host.locator(".history-replay");
  await expect(replay).toBeVisible();
  await expect(
    replay.getByText("Imported history · not independently verified"),
  ).toBeVisible();
  await expect(
    replay.locator("[data-history-public-card]").first(),
  ).toBeVisible();
  await expect(
    replay.locator(".history-replay__board [data-history-public-card]").first(),
  ).toBeVisible();
  const fullFaceCard = replay
    .locator(
      ".history-replay__board [data-history-public-card] > .card--svg-face",
    )
    .first();
  await expect(fullFaceCard).toBeVisible();
  const fullFaceStyle = await fullFaceCard.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      padding: style.padding,
      borderWidth: style.borderWidth,
      backgroundColor: style.backgroundColor,
    };
  });
  expect(fullFaceStyle.padding).toBe("0px");
  expect(fullFaceStyle.borderWidth).toBe("0px");
  expect(fullFaceStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  const fullFaceBox = await fullFaceCard.boundingBox();
  const fullFaceImageBox = await fullFaceCard
    .locator(".card__face-svg")
    .boundingBox();
  if (!fullFaceBox || !fullFaceImageBox) {
    throw new Error("Full-face replay card and SVG face must be measurable.");
  }
  expect(Math.abs(fullFaceBox.x - fullFaceImageBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(fullFaceBox.y - fullFaceImageBox.y)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(fullFaceBox.width - fullFaceImageBox.width),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(fullFaceBox.height - fullFaceImageBox.height),
  ).toBeLessThanOrEqual(1);
  await expect(
    replay
      .locator(".history-replay__seat-cards [data-history-public-card]")
      .first(),
  ).toBeVisible();
  await assertNoOverlap(
    host,
    ".history-replay__filters > *",
    "history filters",
  );
  await assertNoHorizontalOverflow(host, "history replay");
});

test("Table secondary menu retains history actions and Host tools retain rounded spacing", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires the assembled Phase 2 release path.",
  );
  const [alice] = await createDigitalTable(host, context, ["Alice", "Bob"]);
  if (!alice) throw new Error("Player fixture required");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await control(host, "device-view-tablet").click();
  await control(host, "tablet-corner-open").last().click();
  await control(host, "tablet-quick-more").click();
  const icons = await host
    .locator(".secondary-control-card__icon")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const outer = node.getBoundingClientRect();
        const glyph = node.querySelector("svg")?.getBoundingClientRect();
        return {
          width: outer.width,
          height: outer.height,
          horizontal: glyph ? (outer.width - glyph.width) / 2 : 0,
          vertical: glyph ? (outer.height - glyph.height) / 2 : 0,
        };
      }),
    );
  expect(icons.length).toBeGreaterThan(0);
  for (const icon of icons) {
    expect(icon.horizontal).toBeGreaterThanOrEqual(6);
    expect(icon.vertical).toBeGreaterThanOrEqual(6);
  }
  const tabletDownload = control(host, "tablet-history-download");
  await exerciseControl(
    "tablet-history-download",
    tabletDownload,
    async (target) => {
      const download = host.waitForEvent("download");
      await target.click();
      await download;
    },
    () => expect(tabletDownload).toBeVisible(),
  );
  const tabletReplay = control(host, "tablet-history-replay");
  await exerciseControl(
    "tablet-history-replay",
    tabletReplay,
    (target) => target.click(),
    () =>
      expect(host.getByRole("heading", { name: "Hand history" })).toBeVisible(),
  );
  await control(host, "history-close").click();
  const tabletExit = control(host, "tablet-exit-page");
  if ((await tabletExit.count()) > 0) {
    await exerciseControl(
      "tablet-exit-page",
      tabletExit,
      (target) => target.click(),
      () =>
        expect(
          host.getByRole("dialog", { name: "Leave this table?" }),
        ).toBeVisible(),
    );
    await control(host, "leave-dialog-cancel").click();
  } else {
    await expect(tabletExit).toHaveCount(0);
  }
  if (await control(host, "tablet-secondary-close").isVisible())
    await control(host, "tablet-secondary-close").click();
  await expect(control(alice, "player-leave-options-open")).toBeVisible();
  await control(alice, "player-leave-options-open").click();
  const playerDownload = control(alice, "player-menu-history-download");
  await exerciseControl(
    "player-menu-history-download",
    playerDownload,
    async (target) => {
      const download = alice.waitForEvent("download");
      await target.click();
      await download;
    },
    () => expect(playerDownload).toBeVisible(),
  );
  const playerReplay = control(alice, "player-menu-history-replay");
  await exerciseControl(
    "player-menu-history-replay",
    playerReplay,
    (target) => target.click(),
    () =>
      expect(
        alice.getByRole("heading", { name: "Hand history" }),
      ).toBeVisible(),
  );
  await control(alice, "history-close").click();
  await control(alice, "player-leave-options-open").click();
  const playerExit = control(alice, "player-menu-exit-page");
  await exerciseControl(
    "player-menu-exit-page",
    playerExit,
    (target) => target.click(),
    () =>
      expect(
        alice.getByRole("dialog", { name: "Leave this table?" }),
      ).toBeVisible(),
  );
  await control(alice, "leave-dialog-cancel").click();
  await switchToHostFromTable(host);
  await control(host, "host-root-controls-open").click();
  const cards = host.locator(".host-control-center .secondary-control-card");
  await expect(cards.first()).toBeVisible();
  const style = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const css = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return {
        radius: Number.parseFloat(css.borderRadius),
        width: box.width,
        height: box.height,
      };
    }),
  );
  expect(
    style.every(
      (value) => value.radius > 0 && value.width > 0 && value.height > 0,
    ),
  ).toBe(true);
  await assertNoOverlap(
    host,
    ".host-control-center .secondary-control-card",
    "Host tools",
  );
});

test("all-in marker is red, triangular, and clear of the stack in Table and TV", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires packaged multiplayer.",
  );
  const [alice] = await createDigitalTable(host, context, ["Alice", "Bob"]);
  if (!alice) throw new Error("Missing player");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await control(alice, "player-bet-all-in").click();
  await expect(host.locator('[data-seat-all-in="true"]')).toHaveCount(1);
  for (const view of ["tablet", "tv"] as const) {
    await control(host, `device-view-${view}`).click();
    const marker = host.locator(".seat-edge-status__accounting-status");
    await expect(marker).toBeVisible();
    const geometry = await marker.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const stack = node.parentElement;
      const text = stack?.firstChild;
      const range = document.createRange();
      if (text) range.selectNode(text);
      const stackBox = range.getBoundingClientRect();
      const triangle = getComputedStyle(node, "::before");
      return {
        width: box.width,
        height: box.height,
        separated:
          box.bottom <= stackBox.top ||
          box.top >= stackBox.bottom ||
          box.right <= stackBox.left ||
          box.left >= stackBox.right,
        clip: triangle.clipPath,
        color: triangle.backgroundColor,
      };
    });
    expect(geometry.width).toBeGreaterThan(40);
    expect(geometry.height).toBeGreaterThanOrEqual(20);
    expect(geometry.separated).toBe(true);
    expect(geometry.clip).toContain("polygon");
    expect(geometry.color).toBe("rgb(239, 98, 81)");
    await switchToHostFromTable(host);
  }
});
