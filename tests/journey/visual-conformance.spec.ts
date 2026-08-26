import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

const referenceViewport = { height: 1_024, width: 1_366 };

async function joinPlayer(
  host: Page,
  context: BrowserContext,
  displayName: string,
): Promise<Page> {
  const invitationUrl = await host
    .getByLabel("Player invitation link")
    .inputValue();
  const player = await context.newPage();
  await player.goto(invitationUrl);
  await player.getByLabel("Display name").fill(displayName);
  await player.getByRole("button", { name: "Join table" }).click();
  await expect(
    player.getByRole("heading", { name: "You have a seat" }),
  ).toBeVisible();
  return player;
}

async function createTable(
  host: Page,
  context: BrowserContext,
): Promise<{ readonly alice: Page; readonly bob: Page }> {
  await host.setViewportSize(referenceViewport);
  await host.goto("/");
  await host.getByRole("button", { name: "Create table" }).click();
  const alice = await joinPlayer(host, context, "Alice");
  const bob = await joinPlayer(host, context, "Bob");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await expect(alice.locator("[data-private-card]")).toHaveCount(2);
  return { alice, bob };
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value, "element must have a rendered bounding box").not.toBeNull();
  if (!value) throw new Error("Expected a rendered bounding box.");
  return value;
}

function expectNear(
  actual: number,
  expected: number,
  tolerance: number,
  label: string,
): void {
  expect(
    Math.abs(actual - expected),
    `${label}: expected ${expected} +/- ${tolerance}, received ${actual}`,
  ).toBeLessThanOrEqual(tolerance);
}

function boxesOverlap(
  first: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
  second: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
  clearance = 0,
): boolean {
  return (
    first.x - clearance < second.x + second.width &&
    first.x + first.width + clearance > second.x &&
    first.y - clearance < second.y + second.height &&
    first.y + first.height + clearance > second.y
  );
}

async function openCorner(
  host: Page,
  corner: "lower left" | "lower right" | "upper left" | "upper right",
): Promise<Locator> {
  await host
    .getByRole("button", { name: `Open table controls from ${corner}` })
    .click();
  const panel = host.getByRole("region", { name: "Table controls" });
  await expect(panel).toBeVisible();
  return panel;
}

async function closeQuickPanel(host: Page): Promise<void> {
  await host.getByRole("button", { name: "Close table controls" }).click();
  await expect(host.locator("[data-control-facing]")).toHaveCount(0);
}

async function dragPlayerShow(player: Page): Promise<void> {
  const slider = player.locator('[data-qa-control="player-show-cards"]');
  await slider.scrollIntoViewIfNeeded();
  const bounds = await box(slider);
  await player.mouse.move(bounds.x + 28, bounds.y + bounds.height / 2);
  await player.mouse.down();
  await player.mouse.move(
    bounds.x + bounds.width - 18,
    bounds.y + bounds.height / 2,
    {
      steps: 8,
    },
  );
  await player.mouse.up();
}

type PhysicalCorner =
  "lower left" | "lower right" | "upper left" | "upper right";

async function expectFlushToPhysicalCorner(
  target: Locator,
  corner: PhysicalCorner,
  label: string,
): Promise<void> {
  const targetBox = await box(target);
  if (corner.includes("left")) {
    expectNear(targetBox.x, 0, 1, `${label} left edge`);
  } else {
    expectNear(
      targetBox.x + targetBox.width,
      referenceViewport.width,
      1,
      `${label} right edge`,
    );
  }
  if (corner.includes("upper")) {
    expectNear(targetBox.y, 0, 1, `${label} upper edge`);
  } else {
    expectNear(
      targetBox.y + targetBox.height,
      referenceViewport.height,
      1,
      `${label} lower edge`,
    );
  }
}

async function installDeterministicEntropy(
  page: Page,
  fixedByte?: number,
): Promise<void> {
  await page.addInitScript((testFixedByte?: number) => {
    // Stable host entropy makes the full card artwork screenshot-testable.
    // This is isolated to the QA page and is never bundled into production.
    let nextByte = 41;
    Object.defineProperty(globalThis.crypto, "getRandomValues", {
      configurable: true,
      value: <T extends ArrayBufferView>(values: T): T => {
        const bytes = new Uint8Array(
          values.buffer,
          values.byteOffset,
          values.byteLength,
        );
        if (testFixedByte !== undefined) {
          // A sequence makes the dealt artwork depend on every preceding
          // crypto call. The ten-player fixture creates enough independent
          // role pages that those calls can differ across Linux runners. A
          // fixed test-only byte locks the shuffle regardless of that timing.
          bytes.fill(testFixedByte);
          return values;
        }
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = nextByte;
          nextByte = (nextByte + 67) % 251;
        }
        return values;
      },
    });
    let uuidCounter = 1;
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: (): `${string}-${string}-${string}-${string}-${string}` => {
        const suffix = uuidCounter.toString(16).padStart(12, "0");
        uuidCounter += 1;
        return `00000000-0000-4000-8000-${suffix}`;
      },
    });
  }, fixedByte);
}

async function prepareScreenshot(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "*{caret-color:transparent!important}",
  });
  await page.evaluate(async () => document.fonts.ready);
}

async function expectRosterMapGeometry(
  administration: Locator,
  expectedCount: number,
): Promise<void> {
  const seatMap = administration.locator(".roster-table-map");
  const seatButtons = seatMap.locator('[data-qa-control="roster-map-seat"]');
  await expect(seatButtons).toHaveCount(expectedCount);
  const communityCards = seatMap.locator(
    ".roster-table-map__community-cards > span",
  );
  await expect(
    communityCards,
    "management map identifies the community-card area with five card outlines",
  ).toHaveCount(5);
  const centreChildren = seatMap.locator(".roster-table-map__centre > *");
  await expect(centreChildren.nth(0)).toHaveClass(
    "roster-table-map__community-cards",
  );
  await expect(centreChildren.nth(1)).toHaveText("Community cards");
  const mapBox = await box(seatMap);
  expect(
    mapBox.width,
    "management map mirrors a landscape rectangular table",
  ).toBeGreaterThan(mapBox.height);
  const mapRadius = await seatMap.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
  );
  expect(
    mapRadius,
    "management map must not regress to an oval table",
  ).toBeLessThanOrEqual(24);
  const buttonLocators = await seatButtons.all();
  const buttonBoxes = await Promise.all(
    buttonLocators.map((button) => box(button)),
  );
  for (const [index, buttonBox] of buttonBoxes.entries()) {
    expect(
      buttonBox.width,
      `map seat ${index + 1} touch width`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      buttonBox.height,
      `map seat ${index + 1} touch height`,
    ).toBeGreaterThanOrEqual(44);
    expect(buttonBox.x).toBeGreaterThanOrEqual(mapBox.x - 1);
    expect(buttonBox.y).toBeGreaterThanOrEqual(mapBox.y - 1);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
      mapBox.x + mapBox.width + 1,
    );
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(
      mapBox.y + mapBox.height + 1,
    );
  }
  for (let first = 0; first < buttonBoxes.length; first += 1) {
    for (let second = first + 1; second < buttonBoxes.length; second += 1) {
      expect(
        boxesOverlap(buttonBoxes[first]!, buttonBoxes[second]!),
        `management map seats ${first + 1} and ${second + 1} must not overlap`,
      ).toBe(false);
    }
  }
  const actualPositions = await seatMap
    .locator("[data-table-edge-position]")
    .evaluateAll((seats) =>
      seats.map((seat) =>
        Number(seat.getAttribute("data-table-edge-position")),
      ),
    );
  const expectedPositions = Array.from({ length: expectedCount }, (_, index) =>
    expectedCount <= 1 ? 5 : Math.round((index * 10) / expectedCount) % 10,
  );
  expect(actualPositions).toEqual(expectedPositions);
  const upright = await seatButtons.evaluateAll((buttons) =>
    buttons.every((button) => {
      const transform = getComputedStyle(button).transform;
      if (transform === "none") return true;
      const matrix = new DOMMatrixReadOnly(transform);
      return (
        Math.abs(matrix.b) < 0.01 &&
        Math.abs(matrix.c) < 0.01 &&
        matrix.a > 0 &&
        matrix.d > 0
      );
    }),
  );
  expect(upright, "every management-map player label remains upright").toBe(
    true,
  );
}

async function screenshotIfChromium(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  if (testInfo.project.name !== "chromium") return;
  // Theme changes affect a composited felt layer and card gradients. Wait for
  // two paints so the reviewed baseline reflects the final visual state rather
  // than a partially composited transition frame.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    fullPage: false,
  });
}

async function screenshotLocatorIfChromium(
  locator: Locator,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  if (testInfo.project.name !== "chromium") return;
  await locator.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(locator).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
  });
}

async function attachQaScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  if (testInfo.project.name !== "chromium") return;
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ animations: "disabled", path });
  await testInfo.attach(name, { contentType: "image/png", path });
}

test("Tablet quiet and quick-control states conform to approved geometry", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "This fixture measures the landscape Tablet surface; phone-specific layouts have dedicated player-mode journeys.",
  );
  await installDeterministicEntropy(host);
  await createTable(host, context);
  for (const actionName of [
    "Deal the flop",
    "Deal the turn",
    "Deal the river",
  ]) {
    const action = host.getByRole("button", { name: actionName });
    await expect(action).toBeEnabled();
    await action.click();
  }
  await host.getByRole("button", { name: "Table View" }).click();

  await expect(host.locator("[data-table-corner]")).toHaveCount(4);
  await expect(host.locator("[data-board-card]")).toHaveCount(5);
  await expect(host.locator("[data-seat-edge-status]")).toHaveCount(2);
  for (const rejectedText of ["Board", "END", "More", "Unlock"]) {
    await expect(host.getByText(rejectedText, { exact: true })).toHaveCount(0);
  }
  await expect(host.locator("input[type='range']")).toHaveCount(0);
  await expect(host.getByText("D", { exact: true })).toBeVisible();
  await expect(host.getByText("SB", { exact: true })).toBeVisible();
  await expect(host.getByText("BB", { exact: true })).toBeVisible();

  const boardCards = host.locator("[data-board-card]");
  const firstCard = await box(boardCards.nth(0));
  const lastCard = await box(boardCards.nth(4));
  expect(lastCard.x + lastCard.width - firstCard.x).toBeGreaterThan(1_000);
  for (let index = 1; index < 5; index += 1) {
    const previous = await box(boardCards.nth(index - 1));
    const current = await box(boardCards.nth(index));
    expect(current.x).toBeGreaterThan(previous.x + previous.width);
  }
  expect(
    await host.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - innerWidth),
    ),
  ).toBe(0);
  for (const target of await host.locator("[data-table-corner]").all()) {
    const targetBox = await box(target);
    expect(targetBox.width).toBeGreaterThanOrEqual(52);
    expect(targetBox.height).toBeGreaterThanOrEqual(52);
  }
  for (const corner of [
    "upper left",
    "upper right",
    "lower left",
    "lower right",
  ] as const) {
    await expectFlushToPhysicalCorner(
      host.getByRole("button", { name: `Open table controls from ${corner}` }),
      corner,
      `table-side Tablet ${corner} launcher`,
    );
  }

  await prepareScreenshot(host);
  await screenshotIfChromium(host, testInfo, "tablet-quiet-dark-green");

  for (const corner of [
    "upper left",
    "upper right",
    "lower left",
    "lower right",
  ] as const) {
    const panel = await openCorner(host, corner);
    await expect(panel).toHaveAttribute(
      "data-control-facing",
      corner.startsWith("upper") ? "upper" : "lower",
    );
    const transform = await panel
      .locator(".tablet-quick-panel__content")
      .evaluate((element) => getComputedStyle(element).transform);
    if (corner.startsWith("upper")) {
      expect(transform).not.toBe("none");
      expect(transform).toMatch(/^matrix\(-1, 0, 0, -1,/u);
    } else {
      expect(transform).toBe("none");
    }
    await expectFlushToPhysicalCorner(
      panel,
      corner,
      `table-side Tablet ${corner} quick panel`,
    );
    if (corner === "upper right") {
      await screenshotIfChromium(host, testInfo, "tablet-quick-upper-right");
    }
    await closeQuickPanel(host);
  }

  await host.locator(".table-surface").evaluate((surface) => {
    surface.setAttribute("data-page-fullscreen", "true");
  });
  const fullscreenExitLauncher = host.getByRole("button", {
    name: "Open table controls from upper left",
  });
  const fullscreenExitLauncherBox = await box(fullscreenExitLauncher);
  expect(fullscreenExitLauncherBox.x).toBeGreaterThanOrEqual(72);
  expect(fullscreenExitLauncherBox.y).toBeGreaterThanOrEqual(72);
  for (const corner of ["upper right", "lower left", "lower right"] as const) {
    await expectFlushToPhysicalCorner(
      host.getByRole("button", { name: `Open table controls from ${corner}` }),
      corner,
      `fullscreen Tablet ${corner} launcher`,
    );
  }
  const fullscreenPanel = await openCorner(host, "upper left");
  await expectFlushToPhysicalCorner(
    fullscreenPanel,
    "upper left",
    "fullscreen Tablet upper-left quick panel",
  );
  await screenshotIfChromium(
    host,
    testInfo,
    "tablet-quick-fullscreen-upper-left",
  );
  await closeQuickPanel(host);
  await host.locator(".table-surface").evaluate((surface) => {
    surface.removeAttribute("data-page-fullscreen");
  });

  const panel = await openCorner(host, "lower right");
  const panelBox = await box(panel);
  expectNear(panelBox.width, 650, 2, "quick panel width");
  expectNear(panelBox.height, 244, 2, "quick panel height");

  const utilityButtons = panel.locator(".tablet-quick-panel__utilities button");
  await expect(utilityButtons).toHaveCount(2);
  const utilityOne = await box(utilityButtons.nth(0));
  const utilityTwo = await box(utilityButtons.nth(1));
  expectNear(utilityOne.width, 52, 1, "more target width");
  expectNear(utilityOne.height, 52, 1, "more target height");
  expectNear(
    utilityTwo.x - utilityOne.x - utilityOne.width,
    20,
    1,
    "utility gap",
  );
  await expect(
    utilityButtons.nth(1).locator("svg.table-close-glyph"),
  ).toBeVisible();
  expect(
    await utilityButtons
      .nth(1)
      .evaluate((element) => getComputedStyle(element).lineHeight),
    "the close glyph must not inherit a text baseline",
  ).toBe("0px");
  const closeBox = await box(utilityButtons.nth(1));
  const closeGlyphBox = await box(
    utilityButtons.nth(1).locator("svg.table-close-glyph"),
  );
  expectNear(
    closeGlyphBox.x + closeGlyphBox.width / 2,
    closeBox.x + closeBox.width / 2,
    0.5,
    "close glyph horizontal center",
  );
  expectNear(
    closeGlyphBox.y + closeGlyphBox.height / 2,
    closeBox.y + closeBox.height / 2,
    0.5,
    "close glyph vertical center",
  );

  const nextCard = await box(panel.getByRole("button", { name: "Next card" }));
  const nextHand = await box(panel.locator(".next-hand-control"));
  expectNear(nextCard.width, 190, 2, "Next Card width");
  expectNear(nextCard.height, 102, 2, "Next Card height");
  expectNear(nextHand.width, 374, 2, "Next Hand width");
  expectNear(nextHand.height, 102, 2, "Next Hand height");
  expectNear(nextHand.x - nextCard.x - nextCard.width, 18, 1, "action gap");

  const slider = panel.getByRole("slider", {
    name: "Slide to deal next hand",
  });
  const sliderBox = await box(slider);
  const handle = slider.locator(".next-hand-slider__handle");
  const handleBox = await box(handle);
  expectNear(sliderBox.width, 156, 1, "slider track width");
  expectNear(sliderBox.height, 64, 1, "slider track height");
  expectNear(handleBox.width, 64, 1, "slider handle width");
  expectNear(handleBox.height, 64, 1, "slider handle height");
  expect(await slider.getAttribute("data-slider-travel")).toBe("92");
  expect(
    await slider.evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("32px");
  expect(
    await handle.evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("32px");
  await expect(handle.locator(".slider-grip i")).toHaveCount(3);
  const visibleThread = panel.locator(
    ".tablet-quick-panel__gold-thread path:visible",
  );
  await expect(visibleThread).toHaveCount(1);
  expect(
    await visibleThread.evaluate(
      (element) => getComputedStyle(element).strokeWidth,
    ),
  ).toBe("4px");

  await screenshotIfChromium(host, testInfo, "tablet-quick-lower-right");
  await panel.getByRole("button", { name: "More table controls" }).click();
  const secondary = host.locator(".secondary-controls");
  await expect(secondary).toBeVisible();
  for (const label of [
    "Players & seats",
    "Appearance",
    "Displays & pairing",
    "This device",
    "Connection & recovery",
    "Diagnostics & history",
  ]) {
    await expect(secondary.getByText(label, { exact: true })).toBeVisible();
  }
  const cardFor = (label: string) =>
    secondary.getByText(label, { exact: true }).locator("xpath=..");
  const [
    playersCard,
    appearanceCard,
    deviceCard,
    displaysCard,
    recoveryCard,
    diagnosticsCard,
  ] = await Promise.all([
    box(cardFor("Players & seats")),
    box(cardFor("Appearance")),
    box(cardFor("This device")),
    box(cardFor("Displays & pairing")),
    box(cardFor("Connection & recovery")),
    box(cardFor("Diagnostics & history")),
  ]);
  expectNear(
    appearanceCard.y + appearanceCard.height / 2,
    deviceCard.y + deviceCard.height / 2,
    1,
    "This device and Appearance share the top row",
  );
  expect(
    deviceCard.x,
    "This device replaces Players & seats to the left of Appearance",
  ).toBeLessThan(appearanceCard.x);
  expectNear(
    displaysCard.y + displaysCard.height / 2,
    playersCard.y + playersCard.height / 2,
    1,
    "Displays and Players & seats share the second row",
  );
  expect(
    displaysCard.x,
    "Displays stays on the left of Players & seats",
  ).toBeLessThan(playersCard.x);
  expectNear(
    recoveryCard.y + recoveryCard.height / 2,
    diagnosticsCard.y + diagnosticsCard.height / 2,
    1,
    "Connection and Diagnostics remain together on the third row",
  );
  expect(
    recoveryCard.x,
    "Connection remains on the left of Diagnostics",
  ).toBeLessThan(diagnosticsCard.x);
  const secondaryBox = await box(secondary);
  expectNear(
    secondaryBox.x + secondaryBox.width / 2,
    referenceViewport.width / 2,
    2,
    "secondary panel horizontal center",
  );
  expectNear(
    secondaryBox.y + secondaryBox.height / 2,
    referenceViewport.height / 2,
    2,
    "secondary panel vertical center",
  );
  await screenshotIfChromium(host, testInfo, "tablet-secondary-dark-green");

  const accessibility = await new AxeBuilder({ page: host }).analyze();
  expect(accessibility.violations).toEqual([]);

  await secondary.getByRole("button", { name: "Black Gold" }).click();
  await expect(host.locator(".table-surface")).toHaveAttribute(
    "data-theme",
    "black-gold",
  );
  await secondary.getByRole("button", { name: "Return to table" }).click();
  expectNear(
    (await box(boardCards.nth(0))).width,
    firstCard.width,
    0.5,
    "Black Gold card geometry",
  );
  await screenshotIfChromium(host, testInfo, "tablet-quiet-black-gold");

  await openCorner(host, "lower right");
  await host.getByRole("button", { name: "More table controls" }).click();
  const navySecondary = host.locator(".secondary-controls");
  await navySecondary.getByRole("button", { name: "Deep Navy" }).click();
  await expect(host.locator(".table-surface")).toHaveAttribute(
    "data-theme",
    "deep-navy",
  );
  await navySecondary.getByRole("button", { name: "Return to table" }).click();
  expectNear(
    (await box(boardCards.nth(0))).width,
    firstCard.width,
    0.5,
    "Deep Navy card geometry",
  );
  await screenshotIfChromium(host, testInfo, "tablet-quiet-deep-navy");
});

test("Tablet and TV keep ten simultaneous shown hands large, distinct, and clear of the board", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile-webkit",
    "The iPhone-WebKit profile covers phone journeys; it cannot represent a wall TV plus ten live device sessions in one browser context.",
  );
  test.setTimeout(60_000);
  await installDeterministicEntropy(host, 41);
  await host.setViewportSize(referenceViewport);
  await host.goto("/");
  await host.getByRole("button", { name: "Create table" }).click();
  await host.getByRole("button", { name: "Create TV link" }).click();
  const tvUrl = await host.getByLabel("TV invitation link").inputValue();
  const players: Page[] = [];
  // Seat joins are authoritative commits, so serialize them. Parallel joins
  // intentionally exercise the revision-conflict path and are not a stable
  // way to construct this visual fixture.
  const longestNormalName = "Alexandria Montgomery XX";
  for (const name of [
    "Alice",
    "Bob",
    "Carol",
    "Dana",
    "Evan",
    "Faye",
    "Gus",
    "Hana",
    "Ivan",
    longestNormalName,
  ]) {
    players.push(await joinPlayer(host, context, name));
    if (players.length === 6) {
      const roster = host.locator(".roster");
      const rosterMap = roster.locator(".roster-table-map");
      await roster.scrollIntoViewIfNeeded();
      await expectRosterMapGeometry(roster, 6);
      await screenshotLocatorIfChromium(
        rosterMap,
        testInfo,
        "host-manage-six-spatial-seats",
      );
    }
  }
  const tenPlayerRoster = host.locator(".roster");
  const tenPlayerRosterMap = tenPlayerRoster.locator(".roster-table-map");
  await tenPlayerRoster.scrollIntoViewIfNeeded();
  await expectRosterMapGeometry(tenPlayerRoster, 10);
  await screenshotLocatorIfChromium(
    tenPlayerRosterMap,
    testInfo,
    "host-manage-ten-spatial-seats",
  );
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await host.getByRole("button", { name: "Deal the flop" }).click();
  await host.getByRole("button", { name: "Deal the turn" }).click();
  await host.getByRole("button", { name: "Deal the river" }).click();
  for (const player of players) {
    await dragPlayerShow(player);
    await expect(player.getByLabel("Your table status")).toContainText(
      "Shown to table",
    );
  }
  await host.getByRole("button", { name: "Table View" }).click();

  const sideGlyph = host.locator(
    '[data-seat-edge-position="3"] [data-seat-status-glyph="seat-facing"]',
  );
  await expect(sideGlyph).toBeVisible();
  expect(
    await sideGlyph.evaluate((element) => getComputedStyle(element).transform),
    "a side player's holding glyph follows that player's reading direction",
  ).toBe("none");
  const sideCardSilhouettes = sideGlyph.locator(":scope > span");
  await expect(sideCardSilhouettes).toHaveCount(2);
  for (const silhouette of await sideCardSilhouettes.all()) {
    expect(
      await silhouette.evaluate(
        (element) => getComputedStyle(element, "::after").content,
      ),
    ).not.toBe("none");
  }

  async function expectTenHandGeometry(
    surface: Page,
    viewport: { readonly height: number; readonly width: number },
    layout: "tablet" | "tv",
  ): Promise<void> {
    const shownCards = surface.locator(".quiet-shown-hand .card--quiet-shown");
    await expect(surface.locator(".quiet-shown-hand")).toHaveCount(10);
    await expect(shownCards).toHaveCount(20);
    await expect(shownCards.locator(".card__face-svg")).toHaveCount(20);
    const shownCardEmphasis = await shownCards.evaluateAll((cards) => ({
      selected: cards.filter((card) => card.classList.contains("card--best"))
        .length,
      faded: cards.filter((card) => card.classList.contains("card--unused"))
        .length,
    }));
    expect(
      shownCardEmphasis.selected + shownCardEmphasis.faded,
      "every shown private card must be either selected or faded at showdown",
    ).toBe(20);
    expect(
      shownCardEmphasis.selected,
      "the winning shown hand must retain selected cards",
    ).toBeGreaterThan(0);
    expect(
      shownCardEmphasis.faded,
      "non-selected shown cards must recede",
    ).toBeGreaterThan(0);
    await expect(
      surface.locator(
        ".seat-edge-status:not(:has(.seat-state-glyph--winner)) .quiet-shown-hand .card--best",
      ),
      "no private card from a non-winning player remains bright",
    ).toHaveCount(0);
    const facesLoaded = await shownCards
      .locator(".card__face-svg")
      .evaluateAll((images) =>
        images.every(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0 &&
            image.naturalHeight > 0,
        ),
      );
    expect(facesLoaded, "all twenty full SVG shown cards must load").toBe(true);

    const shownBoxes = await Promise.all(
      (await shownCards.all()).map((card) => box(card)),
    );
    for (const shownBox of shownBoxes) {
      expect(
        Math.min(shownBox.width, shownBox.height),
        "shown cards use the larger quiet-table face",
      ).toBeGreaterThanOrEqual(90);
      expect(shownBox.x, "shown card left edge").toBeGreaterThanOrEqual(0);
      expect(shownBox.y, "shown card top edge").toBeGreaterThanOrEqual(0);
      expect(
        shownBox.x + shownBox.width,
        "shown card right edge",
      ).toBeLessThanOrEqual(viewport.width);
      expect(
        shownBox.y + shownBox.height,
        "shown card bottom edge",
      ).toBeLessThanOrEqual(viewport.height);
      if (layout === "tv") {
        expect(
          shownBox.height,
          "wall-mounted TV shown cards stay upright",
        ).toBeGreaterThan(shownBox.width);
      }
    }
    for (let first = 0; first < shownBoxes.length; first += 1) {
      for (let second = first + 1; second < shownBoxes.length; second += 1) {
        const earlier = shownBoxes[first]!;
        const later = shownBoxes[second]!;
        const overlaps = boxesOverlap(earlier, later);
        expect(
          overlaps,
          `shown card ${first + 1} must not overlap shown card ${second + 1}`,
        ).toBe(false);
      }
    }

    const boardCards = surface.locator("[data-board-card]");
    await expect(boardCards).toHaveCount(5);
    await expect(boardCards.locator(".card__face-svg")).toHaveCount(5);
    const boardCardEmphasis = await boardCards.evaluateAll((cards) => ({
      selected: cards.filter((card) => card.classList.contains("card--best"))
        .length,
      faded: cards.filter((card) => card.classList.contains("card--unused"))
        .length,
    }));
    expect(
      boardCardEmphasis.selected + boardCardEmphasis.faded,
      "every community card must be either selected or faded at showdown",
    ).toBe(5);
    expect(
      boardCardEmphasis.selected,
      "the best available hand must retain selected community cards",
    ).toBeGreaterThan(0);
    expect(
      boardCardEmphasis.faded,
      "non-selected community cards must recede",
    ).toBeGreaterThan(0);
    const winningSeats = surface.locator(
      ".seat-edge-status:has(.seat-state-glyph--winner)",
    );
    await expect(
      winningSeats,
      "the deterministic ten-player fixture has one winning seat",
    ).toHaveCount(1);
    const winningPrivateSelection = winningSeats.locator(
      ".quiet-shown-hand .card--best",
    );
    expect(
      (await winningPrivateSelection.count()) + boardCardEmphasis.selected,
      "winner-private plus community selection must form exactly five cards",
    ).toBe(5);
    const boardBoxes = await Promise.all(
      (await boardCards.all()).map((card) => box(card)),
    );
    for (let shownIndex = 0; shownIndex < shownBoxes.length; shownIndex += 1) {
      const shownBox = shownBoxes[shownIndex]!;
      for (
        let boardIndex = 0;
        boardIndex < boardBoxes.length;
        boardIndex += 1
      ) {
        const boardBox = boardBoxes[boardIndex]!;
        const overlaps = boxesOverlap(shownBox, boardBox);
        expect(
          overlaps,
          `shown card ${shownIndex + 1} must not cover community card ${boardIndex + 1}`,
        ).toBe(false);
      }
    }

    const seatIndicators = surface.locator(
      "[data-seat-status-glyph], .position-token",
    );
    await expect(seatIndicators).toHaveCount(13);
    const indicatorLocators = await seatIndicators.all();
    const indicatorBoxes = await Promise.all(
      indicatorLocators.map((indicator) => box(indicator)),
    );
    const indicatorLabels = await Promise.all(
      indicatorLocators.map((indicator) =>
        indicator.evaluate((element) => {
          const seat = element.closest("[data-seat-id]");
          const seatId = seat?.getAttribute("data-seat-id") ?? "unknown-seat";
          const kind = element.classList.contains("position-token")
            ? element.textContent?.trim() || "position"
            : "status";
          return `${seatId}:${kind}`;
        }),
      ),
    );
    for (let shownIndex = 0; shownIndex < shownBoxes.length; shownIndex += 1) {
      const shownBox = shownBoxes[shownIndex]!;
      for (
        let indicatorIndex = 0;
        indicatorIndex < indicatorBoxes.length;
        indicatorIndex += 1
      ) {
        expect(
          boxesOverlap(shownBox, indicatorBoxes[indicatorIndex]!, 4),
          `shown card ${shownIndex + 1} must keep clear of ${indicatorLabels[indicatorIndex]}`,
        ).toBe(false);
      }
    }

    if (layout === "tv") {
      const orientations = await surface
        .locator(".seat-edge-status")
        .evaluateAll((seats) =>
          seats.map((seat) => {
            const transform = getComputedStyle(seat).transform;
            if (transform === "none") return true;
            const matrix = new DOMMatrixReadOnly(transform);
            return (
              Math.abs(matrix.b) < 0.01 &&
              Math.abs(matrix.c) < 0.01 &&
              matrix.a > 0 &&
              matrix.d > 0
            );
          }),
        );
      expect(
        orientations.every(Boolean),
        "every TV seat, card, role, and status indicator faces the wall viewer",
      ).toBe(true);
    }
  }

  await expectTenHandGeometry(host, referenceViewport, "tablet");
  await host
    .getByRole("button", { name: "Open table controls from lower right" })
    .click();
  await host.getByRole("button", { name: "More table controls" }).click();
  await attachQaScreenshot(
    host,
    testInfo,
    "qa-tablet-show-player-names-control",
  );
  await host.getByRole("button", { name: "Show player names" }).click();
  await expect(host.locator(".seat-edge-status__name")).toHaveCount(10);
  await expect(
    host.locator('[data-seat-id="seat-10"] .seat-edge-status__name'),
  ).toHaveAttribute("title", longestNormalName);
  await host.getByRole("button", { name: "Return to table" }).click();
  await expect(host.locator(".secondary-controls")).toHaveCount(0);
  await expect(host.locator(".public-table")).toBeVisible();
  await host.locator(".public-table").scrollIntoViewIfNeeded();
  await expectTenHandGeometry(host, referenceViewport, "tablet");
  await prepareScreenshot(host);
  await screenshotIfChromium(host, testInfo, "tablet-ten-player-shown-hands");
  await attachQaScreenshot(
    host,
    testInfo,
    "qa-tablet-ten-player-shown-hands-with-names",
  );

  const tv = await context.newPage();
  const tvViewport = { height: 1_080, width: 1_920 };
  await tv.setViewportSize(tvViewport);
  // Mobile WebKit can keep the full-page load event open for non-critical
  // resources when the ten-seat fixture has several role pages. The rendered
  // public-table heading below is the relevant readiness signal.
  await tv.goto(tvUrl, { waitUntil: "commit" });
  await expect(tv.getByRole("heading", { name: "Public table" })).toBeVisible();
  await expectTenHandGeometry(tv, tvViewport, "tv");
  await expect(tv.locator(".seat-edge-status__name")).toHaveCount(10);
  const longTvName = tv.locator(
    '[data-seat-id="seat-10"] .seat-edge-status__name',
  );
  await expect(longTvName).toHaveAttribute("title", longestNormalName);
  await expect(longTvName).toHaveCSS("text-overflow", "ellipsis");
  await expect(longTvName).toHaveCSS("white-space", "nowrap");
  await prepareScreenshot(tv);
  await screenshotIfChromium(tv, testInfo, "tv-ten-player-shown-hands");
  await attachQaScreenshot(tv, testInfo, "qa-tv-ten-player-shown-hands");
});

test("Tablet showdown preserves the quiet board geometry and places the result note directly below it", async ({
  context,
  page: host,
}, testInfo) => {
  await installDeterministicEntropy(host);
  const { alice } = await createTable(host, context);
  await host.getByRole("button", { name: "Deal the flop" }).click();
  await host.getByRole("button", { name: "Deal the turn" }).click();
  await host.getByRole("button", { name: "Deal the river" }).click();
  await host.getByRole("button", { name: "Table View" }).click();

  const rail = host.locator(".public-table--quiet .dealer-rail");
  const beforeShow = await box(rail);
  await dragPlayerShow(alice);
  const resultNote = host.getByText("Best available shown hand is marked.");
  await expect(resultNote).toBeVisible();
  const afterShow = await box(rail);
  expectNear(afterShow.x, beforeShow.x, 1, "showdown board left position");
  expectNear(afterShow.y, beforeShow.y, 1, "showdown board top position");
  expectNear(afterShow.width, beforeShow.width, 1, "showdown board width");
  expectNear(afterShow.height, beforeShow.height, 1, "showdown board height");
  const noteBox = await box(resultNote);
  expect(noteBox.y).toBeGreaterThanOrEqual(afterShow.y + afterShow.height);
  expect(
    noteBox.y - (afterShow.y + afterShow.height),
    "the showdown explanation belongs immediately below the unchanged board",
  ).toBeLessThanOrEqual(40);

  await prepareScreenshot(host);
  await screenshotIfChromium(host, testInfo, "tablet-showdown-stable");
});

test("every host Tablet secondary action is exercised and player administration mutates state", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile-webkit",
    "The iPhone-WebKit profile covers phone journeys; this multi-role host Tablet administration fixture is covered by Chromium Tablet/desktop projects.",
  );
  await installDeterministicEntropy(host);
  const { alice, bob } = await createTable(host, context);
  await host.getByRole("button", { name: "Table View" }).click();
  const expectedActionIds = [
    "card-style-classic",
    "card-style-four-colour",
    "close-secondary",
    "fullscreen",
    "host-controls",
    "manage-displays",
    "manage-players",
    "reconnect",
    "return-table",
    "save-log",
    "theme-black-gold",
    "theme-dark-green",
    "theme-deep-navy",
  ].sort();
  const exercisedActionIds = new Set<string>();

  async function openSecondary(): Promise<Locator> {
    await openCorner(host, "lower right");
    await host.getByRole("button", { name: "More table controls" }).click();
    const secondary = host.locator(".secondary-controls");
    await expect(secondary).toBeVisible();
    return secondary;
  }

  let secondary = await openSecondary();
  expect(
    (
      await secondary
        .locator("[data-qa-action]")
        .evaluateAll((actions) =>
          actions.map((action) => action.getAttribute("data-qa-action")),
        )
    ).sort(),
  ).toEqual(expectedActionIds);

  async function invokeSecondary(actionId: string): Promise<void> {
    await secondary.locator(`[data-qa-action="${actionId}"]`).click();
    exercisedActionIds.add(actionId);
  }

  await invokeSecondary("theme-dark-green");
  await invokeSecondary("theme-deep-navy");
  await invokeSecondary("theme-black-gold");
  await invokeSecondary("card-style-four-colour");
  for (const screen of [host, alice, bob]) {
    await expect(screen.locator(".table-surface")).toHaveAttribute(
      "data-card-style",
      "four-colour",
    );
  }
  await invokeSecondary("card-style-classic");
  for (const screen of [host, alice, bob]) {
    await expect(screen.locator(".table-surface")).toHaveAttribute(
      "data-theme",
      "black-gold",
    );
  }

  await host.evaluate(() => {
    let fullscreenActive = false;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => (fullscreenActive ? document.documentElement : null),
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: async () => {
        fullscreenActive = true;
        document.documentElement.dataset.fullscreenRequested = "true";
        document.dispatchEvent(new Event("fullscreenchange"));
      },
    });
  });
  await invokeSecondary("fullscreen");
  await expect(host.locator("html")).toHaveAttribute(
    "data-fullscreen-requested",
    "true",
  );
  await expect(host.locator(".table-surface")).toHaveAttribute(
    "data-page-fullscreen",
    "true",
  );
  await invokeSecondary("reconnect");
  await expect(secondary).toBeVisible();
  const downloadPromise = host.waitForEvent("download");
  await invokeSecondary("save-log");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("diagnostics.json");

  await invokeSecondary("return-table");
  await expect(secondary).toHaveCount(0);
  secondary = await openSecondary();
  await invokeSecondary("close-secondary");
  await expect(secondary).toHaveCount(0);
  secondary = await openSecondary();
  await invokeSecondary("host-controls");
  await expect(
    host.getByRole("button", { name: "Host Controls" }),
  ).toHaveAttribute("aria-pressed", "true");

  await host.getByRole("button", { name: "Table View" }).click();
  secondary = await openSecondary();
  await invokeSecondary("manage-players");
  const administration = host.getByRole("complementary", {
    name: "Player administration",
  });
  await expect(administration).toBeVisible();
  await expect(administration).toHaveAttribute("data-admin-focus", "players");
  await expect(
    host.getByRole("button", { name: "Host Controls" }),
  ).toHaveAttribute("aria-pressed", "true");
  const invitation = administration.locator(".invite-panel");
  await expect(invitation).toBeInViewport();
  await expect(
    invitation.getByRole("heading", { name: "Add a player" }),
  ).toBeVisible();
  const roster = administration.locator(".roster");
  expect((await box(invitation)).y).toBeLessThan((await box(roster)).y);
  await roster.scrollIntoViewIfNeeded();
  await expect(roster).toBeInViewport();
  await expect(
    roster.getByText("2 of 10 joined", { exact: true }),
  ).toBeVisible();
  await expect(
    roster.getByRole("button", { name: "Stop new players" }),
  ).toBeVisible();
  const seatMap = roster.locator(".roster-table-map");
  await expect(seatMap).toBeVisible();
  await expect(
    seatMap.getByRole("button", { name: /^Seat 1, Alice,/u }),
  ).toBeVisible();
  await expect(
    seatMap.getByRole("button", { name: /^Seat 2, Bob,/u }),
  ).toBeVisible();
  const aliceMapBox = await box(
    seatMap.getByRole("button", { name: /^Seat 1, Alice,/u }),
  );
  const bobMapBox = await box(
    seatMap.getByRole("button", { name: /^Seat 2, Bob,/u }),
  );
  expect(
    Math.abs(aliceMapBox.y - bobMapBox.y),
    "two players must occupy visibly different table edges rather than an abstract number list",
  ).toBeGreaterThan(120);
  await expect(
    roster.getByRole("button", { name: "Replace device" }),
  ).toHaveCount(1);
  await prepareScreenshot(host);
  await screenshotIfChromium(host, testInfo, "tablet-manage-players");
  await seatMap.getByRole("button", { name: /^Seat 2, Bob,/u }).click();
  await administration.getByRole("button", { name: "Move Bob up" }).click();
  await expect(administration.locator(".roster li strong").first()).toHaveText(
    "Bob",
  );

  await host
    .getByRole("button", { name: "Close player administration" })
    .click();
  await host.getByRole("button", { name: "Table View" }).click();
  secondary = await openSecondary();
  await invokeSecondary("manage-displays");
  await expect(administration).toBeVisible();
  await expect(administration).toHaveAttribute("data-admin-focus", "displays");
  const displayAdministration = administration.locator(".role-invitations");
  await expect(displayAdministration).toBeInViewport();
  expect((await box(displayAdministration)).y).toBeLessThan(
    (await box(administration.locator(".roster"))).y,
  );
  await expect(
    administration.getByRole("button", { name: "Create Tablet Control link" }),
  ).toBeVisible();
  expect([...exercisedActionIds].sort()).toEqual(expectedActionIds);
});

test("the short physical slider immediately begins a fresh hand with automatic panel closure", async ({
  context,
  page: host,
}) => {
  await createTable(host, context);
  await host.getByRole("button", { name: "Table View" }).click();

  await openCorner(host, "lower right");
  let slider = host.getByRole("slider", {
    name: "Slide to deal next hand",
  });
  await expect(slider).toHaveAttribute("aria-disabled", "false");
  const track = await box(slider);
  await host.mouse.move(track.x + 32, track.y + 32);
  await host.mouse.down();
  await host.mouse.move(track.x + 124, track.y + 32, { steps: 8 });
  await host.mouse.up();
  await expect(host.locator("[data-control-facing]")).toHaveCount(0);

  await openCorner(host, "lower right");
  await host.getByRole("button", { name: "More table controls" }).click();
  await host.getByRole("button", { name: "Host Controls" }).click();
  await expect(
    host.getByText("Pre-flop", { exact: true }).first(),
  ).toBeVisible();
  await expect(host.locator("[data-board-card]")).toHaveCount(0);

  await host.getByRole("button", { name: "End hand" }).click();
  await host.getByRole("button", { name: "End this hand" }).click();
  await expect(
    host.getByText("Hand complete", { exact: true }).first(),
  ).toBeVisible();
  await host.getByRole("button", { name: "Table View" }).click();
  await openCorner(host, "upper left");
  slider = host.getByRole("slider", { name: "Slide to deal next hand" });
  await expect(slider).toHaveAttribute("aria-disabled", "false");
  const upperTrack = await box(slider);
  await host.mouse.move(
    upperTrack.x + upperTrack.width - 32,
    upperTrack.y + 32,
  );
  await host.mouse.down();
  await host.mouse.move(
    upperTrack.x + upperTrack.width - 124,
    upperTrack.y + 32,
    {
      steps: 8,
    },
  );
  await expect(slider).toHaveAttribute("aria-valuetext", "Release to confirm");
  await host.mouse.up();
  await expect(host.locator("[data-control-facing]")).toHaveCount(0);
  await openCorner(host, "upper left");
  await host.getByRole("button", { name: "More table controls" }).click();
  await host.getByRole("button", { name: "Host Controls" }).click();
  await expect(
    host.getByText("Pre-flop", { exact: true }).first(),
  ).toBeVisible();
});
