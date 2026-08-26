import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { exerciseControl } from "./control-qa";

async function expectSvgFacesLoaded(images: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        images.evaluateAll((elements) =>
          elements.every((element) => {
            const image = element as HTMLImageElement;
            return (
              image.complete &&
              image.naturalWidth > 0 &&
              image.naturalHeight > 0
            );
          }),
        ),
      { message: "SVG card faces should finish loading" },
    )
    .toBe(true);
  const states = await images.evaluateAll((elements) =>
    elements.map((element) => {
      const image = element as HTMLImageElement;
      return {
        complete: image.complete,
        naturalHeight: image.naturalHeight,
        naturalWidth: image.naturalWidth,
      };
    }),
  );
  expect(states.length).toBeGreaterThan(0);
  for (const state of states) {
    expect(state.complete).toBe(true);
    expect(state.naturalWidth).toBeGreaterThan(0);
    expect(state.naturalHeight).toBeGreaterThan(0);
  }
}

async function expectFiveBySevenCardGeometry(cards: Locator): Promise<void> {
  const ratios = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return box.width / box.height;
    }),
  );
  expect(ratios.length).toBeGreaterThan(0);
  for (const ratio of ratios) {
    expect(ratio).toBeCloseTo(5 / 7, 2);
  }
}

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
  await host.goto("/");
  await host.getByRole("button", { name: "Create table" }).click();
  const alice = await joinPlayer(host, context, "Alice");
  const bob = await joinPlayer(host, context, "Bob");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await expect(alice.locator("[data-private-card]")).toHaveCount(2);
  return { alice, bob };
}

async function endCurrentHand(host: Page): Promise<void> {
  await host.getByRole("button", { name: "End hand" }).click();
  await host.getByRole("button", { name: "End this hand" }).click();
  await expect(
    host.getByText("Hand complete", { exact: true }).first(),
  ).toBeVisible();
}

async function hostRevision(host: Page): Promise<number> {
  const label = await host.locator(".table-status span").first().textContent();
  const revision = Number(label?.replace(/^r/u, ""));
  if (!Number.isSafeInteger(revision)) {
    throw new Error(`Invalid host revision label: ${label ?? "missing"}`);
  }
  return revision;
}

async function screenshotIfChromium(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  if (testInfo.project.name !== "chromium") return;
  await page.evaluate(async () => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    fullPage: true,
  });
}

async function attachReviewScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ animations: "disabled", fullPage: true, path });
  await testInfo.attach(name, { contentType: "image/png", path });
}

async function screenshotEveryProject(page: Page, name: string): Promise<void> {
  await page.evaluate(async () => document.fonts.ready);
  const testInfo = test.info();
  // Phone engines still execute the complete behavior and geometry contract,
  // but their captures are review evidence rather than desktop pixel
  // baselines. This avoids approving a macOS WebKit raster as a Linux CI
  // baseline while preserving attached real-engine evidence.
  if (testInfo.project.name !== "chromium") {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ animations: "disabled", fullPage: true, path });
    await testInfo.attach(name, { contentType: "image/png", path });
    return;
  }
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    fullPage: true,
  });
}

async function dragToConfirm(page: Page, slider: Locator): Promise<void> {
  await slider.scrollIntoViewIfNeeded();
  const bounds = await slider.boundingBox();
  if (!bounds) throw new Error("The confirmation slider is not measurable.");
  await page.mouse.move(bounds.x + 28, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width - 18,
    bounds.y + bounds.height / 2,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
}

async function attachCompactCardReviewImage(
  page: Page,
  testInfo: TestInfo,
  viewport: { readonly height: number; readonly width: number },
): Promise<void> {
  const name = `table-side-compact-six-${testInfo.project.name}-${viewport.width}`;
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ fullPage: true, path });
  await testInfo.attach(name, { contentType: "image/png", path });
}

test("Home can open a pasted player invitation and exposes an in-page QR scanner", async ({
  context,
  page: host,
}, testInfo: TestInfo) => {
  await host.setViewportSize({ height: 852, width: 393 });
  await host.goto("/");
  await expect(
    host.getByRole("heading", { name: "Join another session" }),
  ).toBeVisible();
  await screenshotIfChromium(host, testInfo, "phone-home");
  await host.getByRole("button", { name: "Create table" }).click();
  const invitationUrl = await host
    .getByLabel("Player invitation link")
    .inputValue();

  const joiner = await context.newPage();
  await joiner.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException(
            "blocked for deterministic QA",
            "NotAllowedError",
          );
        },
      },
    });
  });
  await joiner.setViewportSize({ height: 852, width: 393 });
  await joiner.goto("/");
  await joiner.getByLabel("Invitation URL").fill(invitationUrl);
  await joiner.getByRole("button", { name: "Open invitation" }).click();
  await expect(
    joiner.getByRole("heading", { name: "Join this table" }),
  ).toBeVisible();
  await screenshotIfChromium(joiner, testInfo, "phone-join");

  const scanner = await context.newPage();
  await scanner.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException(
            "blocked for deterministic QA",
            "NotAllowedError",
          );
        },
      },
    });
  });
  await scanner.goto("/");
  await scanner.getByRole("button", { name: "Scan invitation QR" }).click();
  const cameraDialog = scanner.getByRole("dialog", {
    name: "Scan player invitation QR",
  });
  await expect(cameraDialog).toBeVisible();
  await expect(cameraDialog.getByText("Use a saved QR image")).toBeVisible();
  await expect(cameraDialog.locator("input[type='file']")).toHaveCount(1);
  await expect(
    cameraDialog.getByText("Nothing from the camera leaves this device."),
  ).toBeVisible();
});

test("browser appearance cannot recolour the warm cards or developer diagnostics", async ({
  context,
  page: host,
}) => {
  await host.emulateMedia({ colorScheme: "dark" });
  await host.goto("/");
  await expect(host.locator('meta[name="color-scheme"]')).toHaveAttribute(
    "content",
    "light",
  );
  const { alice } = await createTable(host, context);
  await host.getByRole("button", { name: "Developer" }).click();

  const developer = host.getByLabel("Developer diagnostics");
  await expect(developer).toBeVisible();
  const developerContrast = await developer.evaluate((element) => {
    const toLinear = (channel: number) => {
      const value = channel / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (value: string) => {
      const channels = value.match(/\d+(?:\.\d+)?/gu)?.slice(0, 3);
      if (!channels || channels.length !== 3) return 0;
      const [red = 0, green = 0, blue = 0] = channels.map(Number);
      return (
        0.2126 * toLinear(red) +
        0.7152 * toLinear(green) +
        0.0722 * toLinear(blue)
      );
    };
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (
      (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05)
    );
  });
  expect(developerContrast).toBeGreaterThanOrEqual(4.5);

  await alice.emulateMedia({ colorScheme: "dark" });
  const darkCardFace = await alice
    .locator("[data-private-card]")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        color: style.color,
        colorScheme: style.colorScheme,
      };
    });
  await alice.emulateMedia({ colorScheme: "light" });
  const lightCardFace = await alice
    .locator("[data-private-card]")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        color: style.color,
        colorScheme: style.colorScheme,
      };
    });
  expect(darkCardFace).toStrictEqual(lightCardFace);
});

test("the iOS Home Screen icon points at a freshly versioned opaque source", async ({
  page,
}) => {
  await page.goto("/");
  const appleTouchIcon = page.locator('head link[rel="apple-touch-icon"]');
  await expect(appleTouchIcon).toHaveAttribute(
    "href",
    /apple-touch-icon-180(?:-[a-zA-Z0-9_-]+)?\.png\?v=opaque-v3/u,
  );
  expect(
    await appleTouchIcon.evaluate(async (link) => {
      const image = new Image();
      image.src = (link as HTMLLinkElement).href;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D canvas is unavailable.");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 1, 1).data[3];
    }),
    "the Apple touch icon must not expose a transparent corner to iOS",
  ).toBe(255);
});

test("Player catches up to new hands, can return from sit-out, and can leave permanently", async ({
  context,
  page: host,
}, testInfo: TestInfo) => {
  const { alice } = await createTable(host, context);
  await alice.setViewportSize({ height: 852, width: 393 });
  await screenshotIfChromium(alice, testInfo, "phone-player-active-covered");

  const openLeaveOptions = alice.getByRole("button", {
    name: "Open leave options",
  });
  const sitOut = alice.getByLabel("Sit out next hand");
  const leave = alice.getByRole("slider", {
    name: "Leave table permanently",
  });
  await expect(sitOut).toHaveCount(0);
  await expect(leave).toHaveCount(0);
  await expect(
    alice.getByText("Leave table permanently", { exact: true }),
  ).toHaveCount(0);
  await expect(openLeaveOptions).toBeVisible();
  await expect(openLeaveOptions).toHaveAttribute(
    "data-qa-control",
    "player-leave-options-open",
  );
  const openLeaveOptionsBox = await openLeaveOptions.boundingBox();
  if (!openLeaveOptionsBox) {
    throw new Error("Open leave options must be measurable.");
  }
  expect(
    openLeaveOptionsBox.width,
    "Open leave options stays compact",
  ).toBeGreaterThanOrEqual(32);
  expect(
    openLeaveOptionsBox.width,
    "Open leave options is no wider than 48px",
  ).toBeLessThanOrEqual(48);
  expect(
    openLeaveOptionsBox.height,
    "Open leave options is no taller than 48px",
  ).toBeLessThanOrEqual(48);
  expect(
    Math.abs(openLeaveOptionsBox.width - openLeaveOptionsBox.height),
    "Open leave options is approximately square",
  ).toBeLessThanOrEqual(8);
  await openLeaveOptions.click();
  const leaveOptions = alice.getByRole("dialog", { name: "Leave options" });
  await expect(leaveOptions).toBeVisible();
  await expect(
    leaveOptions.getByText(
      "Sit out skips the incoming hands while keeping your seat till you back.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    leaveOptions.getByRole("switch", { name: "Sit out next hand" }),
  ).toBeVisible();
  await expect(leave).toBeVisible();
  await expect(leave).toHaveAttribute("role", "slider");
  await expect(leave).toHaveAttribute("aria-orientation", "horizontal");
  await expect(leave).toHaveAttribute("id", "player-leave-active");
  await expect(leave.locator(".player-confirm-slider__handle")).toHaveCount(1);
  await expect(
    leaveOptions.getByText("Slide to leave table permanently", { exact: true }),
  ).toHaveCount(0);
  await expect(
    leaveOptions.getByText("Release at the end to continue", { exact: true }),
  ).toHaveCount(0);
  const [leaveBox, leaveOptionsBox, leaveColour] = await Promise.all([
    leave.boundingBox(),
    leaveOptions.boundingBox(),
    leave.evaluate((element) => {
      const handle = element.querySelector<HTMLElement>(
        ".player-confirm-slider__handle",
      );
      if (!handle) throw new Error("Leave slider handle is missing.");
      return {
        border: getComputedStyle(element).borderTopColor,
        handle: getComputedStyle(handle).backgroundColor,
      };
    }),
  ]);
  if (!leaveBox || !leaveOptionsBox) {
    throw new Error("Leave slider and its pop-out must be measurable.");
  }
  const leaveSliderContainer = leave.locator("xpath=..");
  const [leaveSliderContainerBox, leaveDividerStyle] = await Promise.all([
    leaveSliderContainer.boundingBox(),
    leaveSliderContainer.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderTopWidth: style.borderTopWidth,
        paddingTop: Number.parseFloat(style.paddingTop),
      };
    }),
  ]);
  if (!leaveSliderContainerBox) {
    throw new Error("Leave slider container must be measurable.");
  }
  expect(
    leaveBox.width / leaveSliderContainerBox.width,
    "Leave slider is larger while remaining shorter than its pop-out",
  ).toBeGreaterThanOrEqual(0.83);
  expect(
    leaveBox.width / leaveSliderContainerBox.width,
    "Leave slider still has clear side margins inside its pop-out",
  ).toBeLessThanOrEqual(0.85);
  expect(
    Math.abs(
      leaveBox.x +
        leaveBox.width / 2 -
        (leaveOptionsBox.x + leaveOptionsBox.width / 2),
    ),
    "Leave slider is centered within its pop-out",
  ).toBeLessThanOrEqual(1);
  expect(
    leaveDividerStyle.borderTopWidth,
    "A divider separates Sit out from the permanent-leave slider",
  ).toBe("1px");
  expect(
    leaveDividerStyle.paddingTop,
    "The permanent-leave slider breathes below the Sit out divider",
  ).toBeGreaterThanOrEqual(12);
  expect(
    leaveColour.handle,
    "Leave slider uses Show's custom circular handle treatment",
  ).toBe(leaveColour.border);
  const closeLeaveOptions = leaveOptions.getByRole("button", {
    name: "Close leave options",
  });
  const closeLeaveOptionsBox = await closeLeaveOptions.boundingBox();
  if (!closeLeaveOptionsBox) {
    throw new Error("Leave-options close button must be measurable.");
  }
  expect(
    closeLeaveOptionsBox.width,
    "Leave-options close circle is smaller than the generic panel control",
  ).toBeLessThanOrEqual(40);
  await leave.press("Home");
  await expect(
    alice.getByRole("dialog", { name: "Leave this table?" }),
  ).toHaveCount(0);
  await dragToConfirm(alice, leave);
  await expect(
    alice.getByRole("dialog", { name: "Leave this table?" }),
  ).toBeVisible();
  await alice.getByRole("button", { name: "Stay at table" }).click();
  await openLeaveOptions.click();
  await expect(leaveOptions).toBeVisible();
  await attachReviewScreenshot(alice, testInfo, "phone-player-leave-options");
  await closeLeaveOptions.click();
  await expect(leaveOptions).toHaveCount(0);
  await attachReviewScreenshot(alice, testInfo, "phone-player-action-rows");

  await host.getByRole("button", { name: /^Players/u }).click();
  await joinPlayer(host, context, "Carol");
  await host
    .getByRole("button", { name: "Close player administration" })
    .click();
  await expect(
    host.getByRole("complementary", { name: "Player administration" }),
  ).toHaveCount(0);
  const recoveryUrl = alice.url();
  const navigationCount = await alice.evaluate(
    () => performance.getEntriesByType("navigation").length,
  );

  await host.getByRole("button", { name: /^Players/u }).click();
  await host.getByRole("button", { name: "Black Gold" }).click();
  await expect(alice.locator(".table-surface")).toHaveAttribute(
    "data-theme",
    "black-gold",
  );
  await host
    .getByRole("button", { name: "Close player administration" })
    .click();
  await expect(
    host.getByRole("complementary", { name: "Player administration" }),
  ).toHaveCount(0);

  const beforeSitOut = await hostRevision(host);
  await openLeaveOptions.click();
  const sitOutOptions = alice.getByRole("dialog", { name: "Leave options" });
  await sitOutOptions.getByLabel("Sit out next hand").click();
  await expect.poll(() => hostRevision(host)).toBeGreaterThan(beforeSitOut);
  await expect(alice.getByLabel("Sit out next hand")).toBeChecked();
  await sitOutOptions
    .getByRole("button", { name: "Close leave options" })
    .click();
  await expect(sitOutOptions).toHaveCount(0);
  await endCurrentHand(host);
  await host.getByRole("button", { name: "Deal next hand" }).click();

  await expect(alice.getByText("Sitting out", { exact: true })).toBeVisible();
  await expect(
    alice.getByRole("button", { name: "Return for next hand" }),
  ).toBeVisible();
  await expect(
    alice.getByRole("button", { name: "Refresh table status" }),
  ).toBeVisible();
  await expect(alice.locator(".message-shell--player-waiting")).toHaveAttribute(
    "data-theme",
    "black-gold",
  );
  const sittingOutSeat = host
    .locator('.seat-tile[data-seat-status="sitting-out"]')
    .filter({ hasText: "Alice" });
  await expect(sittingOutSeat).toBeVisible();
  await expect(sittingOutSeat.locator(".dealer-chip")).toHaveCount(0);
  await host
    .getByLabel("This device view")
    .getByRole("button", { name: "Table View" })
    .click();
  const sittingOutEdge = host.locator('[data-seat-edge-status="sitting out"]');
  await expect(sittingOutEdge).toBeVisible();
  await expect(sittingOutEdge.locator(".position-token")).toHaveCount(0);
  await host
    .getByRole("button", { name: "Open table controls from lower right" })
    .click();
  await host.getByRole("button", { name: "More table controls" }).click();
  await host.getByRole("button", { name: "Host Controls" }).click();
  await host.getByRole("button", { name: /^Players/u }).click();
  await host.getByRole("button", { name: "Dark Green" }).click();
  await expect(alice.locator(".message-shell--player-waiting")).toHaveAttribute(
    "data-theme",
    "dark-green",
  );
  await host
    .getByRole("button", { name: "Close player administration" })
    .click();
  await expect(
    host.getByRole("complementary", { name: "Player administration" }),
  ).toHaveCount(0);
  await screenshotIfChromium(alice, testInfo, "phone-player-sitting-out");
  const beforeReturn = await hostRevision(host);
  await alice.getByRole("button", { name: "Return for next hand" }).click();
  await expect.poll(() => hostRevision(host)).toBeGreaterThan(beforeReturn);
  await expect(
    alice.getByRole("button", { name: "Return for next hand" }),
  ).toHaveCount(0);
  await expect(
    alice.getByText("Ready for next hand", { exact: true }),
  ).toBeVisible();

  await endCurrentHand(host);
  await host.getByRole("button", { name: "Deal next hand" }).click();
  await expect(alice.locator("[data-private-card]")).toHaveCount(2);
  expect(
    await alice.evaluate(
      () => performance.getEntriesByType("navigation").length,
    ),
  ).toBe(navigationCount);

  await openLeaveOptions.click();
  const finalLeaveOptions = alice.getByRole("dialog", {
    name: "Leave options",
  });
  await finalLeaveOptions
    .getByRole("slider", { name: "Leave table permanently" })
    .press("End");
  const confirmation = alice.getByRole("dialog", { name: "Leave this table?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Leave permanently" }).click();
  await expect(
    alice.getByRole("heading", { name: "Join another session" }),
  ).toBeVisible();

  const staleSeat = await context.newPage();
  // The rejection page is its own proof of completion. Waiting for the page's
  // full `load` event makes this recovery check depend on mobile WebKit's
  // secondary resource timing rather than the revoked-credential behaviour.
  await staleSeat.goto(recoveryUrl, { waitUntil: "commit" });
  await expect(
    staleSeat.getByRole("heading", { name: "This seat could not be opened" }),
  ).toBeVisible();
  await expect(staleSeat.getByText(/revoked|no longer valid/iu)).toBeVisible();
});

test("Phone host cards stay compact while Table View shown cards are full, and showdown marks the winning best five", async ({
  context,
  page: host,
}, testInfo: TestInfo) => {
  await host.setViewportSize({ height: 852, width: 393 });
  await host.addInitScript(() => {
    // Visual QA needs a stable shuffled deck. This replacement is scoped to
    // the isolated test page and is never part of the production runtime.
    let nextByte = 48;
    Object.defineProperty(globalThis.crypto, "getRandomValues", {
      configurable: true,
      value: <T extends ArrayBufferView>(values: T): T => {
        const bytes = new Uint8Array(
          values.buffer,
          values.byteOffset,
          values.byteLength,
        );
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = nextByte;
          nextByte = (nextByte + 73) % 251;
        }
        return values;
      },
    });
  });
  const { alice, bob } = await createTable(host, context);
  await bob.getByRole("button", { name: "Fold", exact: true }).click();
  await host.getByRole("button", { name: "Deal the flop" }).click();
  await host.getByRole("button", { name: "Deal the turn" }).click();
  await host.getByRole("button", { name: "Deal the river" }).click();
  await dragToConfirm(
    alice,
    alice.locator('[data-qa-control="player-show-cards"]'),
  );

  await expect(
    host.getByText("Best available shown hand is marked."),
  ).toBeVisible();
  await expect(host.locator("[data-best-five-card]")).toHaveCount(5);
  await expect(host.locator(".card--unused")).toHaveCount(2);

  const miniHand = host.locator(".mini-hand").filter({ hasText: "" }).first();
  await expect(miniHand.locator(".card--compact")).toHaveCount(2);
  // This deterministic deal uses both of the winner's private cards. Both
  // remain selected while the two non-best board cards still fade.
  await expect(miniHand.locator(".card--best")).toHaveCount(2);
  await expect(miniHand.locator(".card--unused")).toHaveCount(0);
  const selectedHoleOpacities = await miniHand
    .locator(".card--best")
    .evaluateAll((elements) =>
      elements.map((element) =>
        Number.parseFloat(getComputedStyle(element).opacity),
      ),
    );
  const unusedHoleOpacity = Number.parseFloat(
    await host
      .locator(".card--unused")
      .first()
      .evaluate((element) => getComputedStyle(element).opacity),
  );
  for (const selectedHoleOpacity of selectedHoleOpacities) {
    expect(selectedHoleOpacity).toBeGreaterThan(unusedHoleOpacity);
  }
  const compactCards = await miniHand.locator(".card--compact").all();
  const compactBoxes = await Promise.all(
    compactCards.map((card) => card.boundingBox()),
  );
  expect(compactBoxes.every(Boolean)).toBe(true);
  const first = compactBoxes[0];
  const second = compactBoxes[1];
  if (!first || !second) throw new Error("Compact cards did not render.");
  expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
  const miniBox = await miniHand.boundingBox();
  if (!miniBox) throw new Error("Mini hand did not render.");
  expect(second.x + second.width).toBeLessThanOrEqual(
    miniBox.x + miniBox.width + 0.5,
  );
  const compactGlyphGeometry = await Promise.all(
    compactCards.map(async (card) => ({
      card: await card.boundingBox(),
      rank: await card.locator(".card__corner--top .card__rank").boundingBox(),
      suit: await card
        .locator(".card__corner--top .card__corner-suit")
        .boundingBox(),
    })),
  );
  const firstGlyph = compactGlyphGeometry[0];
  const secondGlyph = compactGlyphGeometry[1];
  if (
    !firstGlyph?.card ||
    !firstGlyph.rank ||
    !firstGlyph.suit ||
    !secondGlyph?.card ||
    !secondGlyph.rank ||
    !secondGlyph.suit
  ) {
    throw new Error("Compact-card glyphs did not render.");
  }
  for (const glyph of compactGlyphGeometry) {
    if (!glyph.card || !glyph.rank || !glyph.suit) continue;
    expect(
      Math.abs(
        glyph.rank.x +
          glyph.rank.width / 2 -
          (glyph.card.x + glyph.card.width / 2),
      ),
    ).toBeLessThan(1);
    expect(
      Math.abs(
        glyph.suit.x +
          glyph.suit.width / 2 -
          (glyph.card.x + glyph.card.width / 2),
      ),
    ).toBeLessThan(1);
  }
  expect(
    Math.abs(
      firstGlyph.rank.y -
        firstGlyph.card.y -
        (secondGlyph.rank.y - secondGlyph.card.y),
    ),
  ).toBeLessThan(1);
  expect(
    Math.abs(
      firstGlyph.suit.y -
        firstGlyph.card.y -
        (secondGlyph.suit.y - secondGlyph.card.y),
    ),
  ).toBeLessThan(1);
  const shownSeatDecoration = await miniHand
    .locator("xpath=..")
    .evaluate((seat) => {
      const style = getComputedStyle(seat);
      return {
        borderWidths: [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ],
        boxShadow: style.boxShadow,
      };
    });
  expect(new Set(shownSeatDecoration.borderWidths).size).toBe(1);
  expect(shownSeatDecoration.boxShadow).not.toContain("inset");
  for (const card of compactCards) {
    await expect(card.locator(".card__corner--bottom")).toBeHidden();
    await expect(card.locator(".card__pip")).toBeHidden();
    const compactStyle = await card.evaluate((element) => {
      const rankStyle = getComputedStyle(
        element.querySelector<HTMLElement>(".card__rank")!,
      );
      const suitStyle = getComputedStyle(
        element.querySelector<HTMLElement>(".card__corner-suit")!,
      );
      return {
        decoration: getComputedStyle(element, "::after").content,
        height: element.getBoundingClientRect().height,
        rankSize: Number.parseFloat(rankStyle.fontSize),
        suitSize: Number.parseFloat(suitStyle.fontSize),
        width: element.getBoundingClientRect().width,
      };
    });
    expect(compactStyle.height / compactStyle.width).toBeLessThan(1.35);
    expect(compactStyle.rankSize).toBeGreaterThanOrEqual(16);
    expect(compactStyle.rankSize).toBeLessThanOrEqual(17);
    expect(compactStyle.suitSize).toBeLessThanOrEqual(15);
    expect(compactStyle.decoration).toBe("none");
  }
  // Host Controls is a phone control surface: its five community cards use
  // the same one-rank/one-suit reading pattern, with every glyph centred to
  // the common card geometry. Tablet and TV keep their full physical faces.
  const hostBoardCards = host.locator(".public-table [data-board-card]");
  await expect(hostBoardCards).toHaveCount(5);
  for (const card of await hostBoardCards.all()) {
    await expect(card).toHaveClass(/card--minimal/);
    await expect(card.locator(".card__corner--bottom")).toBeHidden();
    await expect(card.locator(".card__pip")).toBeHidden();
    const hostGlyph = await card.evaluate((element) => {
      const cardBox = element.getBoundingClientRect();
      const rankBox = element
        .querySelector<HTMLElement>(".card__rank")!
        .getBoundingClientRect();
      const suitBox = element
        .querySelector<HTMLElement>(".card__corner-suit")!
        .getBoundingClientRect();
      return {
        cardCenter: cardBox.width / 2,
        decoration: getComputedStyle(element, "::after").content,
        decorationBorderWidth: getComputedStyle(element, "::after")
          .borderTopWidth,
        rankCenter: rankBox.left + rankBox.width / 2 - cardBox.left,
        suitCenter: suitBox.left + suitBox.width / 2 - cardBox.left,
        verticalGap: suitBox.top - rankBox.bottom,
      };
    });
    expect(Math.abs(hostGlyph.rankCenter - hostGlyph.cardCenter)).toBeLessThan(
      1,
    );
    expect(Math.abs(hostGlyph.suitCenter - hostGlyph.cardCenter)).toBeLessThan(
      1,
    );
    expect(hostGlyph.decoration).toBe('""');
    expect(hostGlyph.decorationBorderWidth).toBe("1px");
    expect(hostGlyph.verticalGap).toBeGreaterThanOrEqual(8);
  }
  expect(
    await host.evaluate(() =>
      Math.max(0, document.documentElement.scrollWidth - innerWidth),
    ),
  ).toBe(0);
  await expect(
    host.getByRole("button", { name: "End hand", exact: true }),
  ).toBeEnabled();

  await alice.setViewportSize({ height: 915, width: 412 });
  const playerBoardCards = alice.locator(".player-board [data-board-card]");
  await expect(playerBoardCards).toHaveCount(5);
  for (const card of await playerBoardCards.all()) {
    await expect(card.locator(".card__corner--bottom")).toBeHidden();
    await expect(card.locator(".card__pip")).toBeHidden();
    const minimalFace = await card.evaluate((element) => {
      const rank = element.querySelector<HTMLElement>(".card__rank");
      const suit = element.querySelector<HTMLElement>(".card__corner-suit");
      if (!rank || !suit)
        throw new Error("Minimal player card face is missing.");
      const cardBox = element.getBoundingClientRect();
      const rankBox = rank.getBoundingClientRect();
      const suitBox = suit.getBoundingClientRect();
      return {
        rankSize: Number.parseFloat(getComputedStyle(rank).fontSize),
        suitSize: Number.parseFloat(getComputedStyle(suit).fontSize),
        decoration: getComputedStyle(element, "::after").content,
        decorationBorderWidth: getComputedStyle(element, "::after")
          .borderTopWidth,
        boxShadow: getComputedStyle(element).boxShadow,
        rankCenter: rankBox.left + rankBox.width / 2 - cardBox.left,
        suitCenter: suitBox.left + suitBox.width / 2 - cardBox.left,
        cardCenter: cardBox.width / 2,
        verticalGap: suitBox.top - rankBox.bottom,
      };
    });
    expect(minimalFace.rankSize).toBeGreaterThanOrEqual(24);
    expect(minimalFace.suitSize).toBeGreaterThanOrEqual(20);
    expect(
      Math.abs(minimalFace.rankCenter - minimalFace.cardCenter),
    ).toBeLessThan(1);
    expect(
      Math.abs(minimalFace.suitCenter - minimalFace.cardCenter),
    ).toBeLessThan(1);
    expect(minimalFace.decoration).toBe('""');
    expect(minimalFace.decorationBorderWidth).toBe("1px");
    expect(minimalFace.boxShadow).not.toContain("inset");
    expect(minimalFace.verticalGap).toBeGreaterThanOrEqual(8);
  }
  for (const viewport of [
    { height: 780, width: 360 },
    { height: 852, width: 393 },
    { height: 915, width: 412 },
  ]) {
    await alice.setViewportSize(viewport);
    const geometries = await playerBoardCards.evaluateAll((cards) =>
      cards.map((card) => {
        const rank = card.querySelector<HTMLElement>(".card__rank")!;
        const suit = card.querySelector<HTMLElement>(".card__corner-suit")!;
        const rankBox = rank.getBoundingClientRect();
        const suitBox = suit.getBoundingClientRect();
        const cardBox = card.getBoundingClientRect();
        return {
          contained:
            rankBox.top >= cardBox.top &&
            suitBox.bottom <= cardBox.bottom &&
            rankBox.left >= cardBox.left &&
            suitBox.right <= cardBox.right,
          verticalGap: suitBox.top - rankBox.bottom,
        };
      }),
    );
    expect(geometries).toHaveLength(5);
    for (const geometry of geometries) {
      expect(geometry.contained).toBe(true);
      expect(geometry.verticalGap).toBeGreaterThanOrEqual(8);
    }
  }
  const cardBoxes = await Promise.all(
    (await playerBoardCards.all()).map((card) => card.boundingBox()),
  );
  expect(cardBoxes.every(Boolean)).toBe(true);
  for (let index = 1; index < cardBoxes.length; index += 1) {
    const previous = cardBoxes[index - 1];
    const current = cardBoxes[index];
    if (!previous || !current)
      throw new Error("Player board cards did not render.");
    expect(current.x).toBeGreaterThanOrEqual(previous.x + previous.width);
  }
  const privateCardGlyph = alice.locator(".seat-state-glyph--cards").first();
  const glyphLayers = await privateCardGlyph
    .locator(":scope > span")
    .evaluateAll((layers) =>
      layers.map((layer) => {
        const style = getComputedStyle(layer);
        return { backgroundColor: style.backgroundColor, zIndex: style.zIndex };
      }),
    );
  expect(glyphLayers).toHaveLength(2);
  expect(glyphLayers[0]?.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(glyphLayers[1]?.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(Number(glyphLayers[1]?.zIndex)).toBeGreaterThan(
    Number(glyphLayers[0]?.zIndex),
  );
  await alice.setViewportSize({ height: 852, width: 393 });
  await screenshotEveryProject(alice, "phone-player-board-minimal-cards");

  await screenshotEveryProject(host, "phone-host-showdown");
  const accessibility = await new AxeBuilder({ page: host }).analyze();
  expect(accessibility.violations).toEqual([]);

  await host.getByRole("button", { name: "Open table control center" }).click();
  const rootControls = host.getByRole("dialog", {
    name: "Table control center",
  });
  await expect(rootControls).toBeVisible();
  await expect(
    rootControls.locator(".secondary-control-card__icon svg"),
  ).toHaveCount(7);
  await expect(
    rootControls.locator(".secondary-control-card__icon"),
  ).toHaveCount(7);
  const controlCenterIcons = rootControls.locator(
    ".secondary-control-card__icon",
  );
  for (const kind of [
    "players",
    "displays",
    "appearance",
    "device",
    "diagnostics",
    "connection",
    "dissolve",
  ]) {
    await expect(
      rootControls.locator(`[data-control-center-icon="${kind}"]`),
    ).toHaveCount(1);
  }
  await expect(
    rootControls.getByRole("button", { name: "Dissolve table" }),
  ).toBeVisible();
  const iconSizes = await controlCenterIcons.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        height: Number.parseFloat(style.height),
        width: Number.parseFloat(style.width),
      };
    }),
  );
  for (const size of iconSizes) {
    expect(size.width).toBeGreaterThanOrEqual(40);
    expect(size.height).toBeGreaterThanOrEqual(40);
  }
  await screenshotIfChromium(host, testInfo, "phone-host-control-center");
  const rootAccessibility = await new AxeBuilder({ page: host }).analyze();
  expect(rootAccessibility.violations).toEqual([]);
  await rootControls
    .getByRole("button", { name: "Close table control center" })
    .click();

  await host.setViewportSize({ height: 1_024, width: 1_366 });
  await host.getByRole("button", { name: "Open table control center" }).click();
  await expect(rootControls).toBeVisible();
  await screenshotIfChromium(host, testInfo, "tablet-host-control-center");
  await rootControls
    .getByRole("button", { name: "Close table control center" })
    .click();
  await host
    .getByLabel("This device view")
    .getByRole("button", { name: "Table View" })
    .click();
  const quietCards = host.locator(".quiet-shown-hand .card--quiet-shown");
  await expect(quietCards).toHaveCount(2);
  const quietCardStyle = await quietCards.first().evaluate((element) => ({
    decoration: getComputedStyle(element, "::after").content,
    height: element.getBoundingClientRect().height,
    width: element.getBoundingClientRect().width,
  }));
  expect(quietCardStyle.decoration).not.toBe("none");
  expect(quietCardStyle.height).toBeGreaterThan(quietCardStyle.width);
  await expect(quietCards.locator(".card__face-svg")).toHaveCount(2);
  await expectSvgFacesLoaded(quietCards.locator(".card__face-svg"));
  await screenshotIfChromium(host, testInfo, "tablet-private-card-status");
});

test("Table-side Player Show is compact, aligned with Fold, and still guarded", async ({
  context,
  page: host,
}, testInfo) => {
  const { alice } = await createTable(host, context);
  const show = alice.locator('[data-qa-control="player-show-cards"]');
  const fold = alice.locator('[data-qa-control="player-fold"]');
  const actions = alice.locator(".player-actions");

  await expect(show).toHaveAttribute("role", "slider");
  await expect(show).toHaveAttribute("aria-orientation", "horizontal");
  await expect(show).toHaveAttribute("id", "player-show-cards");
  for (const width of [360, 393, 412]) {
    await alice.setViewportSize({ height: 852, width });
    const [showBox, foldBox, actionsBox, showColours, showLabelMetrics] =
      await Promise.all([
        show.boundingBox(),
        fold.boundingBox(),
        actions.boundingBox(),
        show.evaluate((element) => {
          const surface = element.closest(".table-surface");
          const handle = element.querySelector<HTMLElement>(
            ".player-confirm-slider__handle",
          );
          if (!surface || !handle)
            throw new Error("Show slider styling is missing.");
          const accentProbe = document.createElement("span");
          accentProbe.style.color = "var(--table-accent)";
          surface.append(accentProbe);
          const accent = getComputedStyle(accentProbe).color;
          accentProbe.remove();
          return {
            accent,
            border: getComputedStyle(element).borderTopColor,
            handle: getComputedStyle(handle).backgroundColor,
          };
        }),
        show.locator(".player-confirm-slider__label").evaluate((element) => {
          const style = getComputedStyle(element);
          const range = document.createRange();
          range.selectNodeContents(element);
          const textRects = Array.from(range.getClientRects());
          return {
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            textHeight: Math.max(...textRects.map((rect) => rect.height)),
            textLineCount: textRects.length,
            whiteSpace: style.whiteSpace,
          };
        }),
      ]);
    if (!showBox || !foldBox || !actionsBox) {
      throw new Error("Fold, Show, and action rows must be measurable.");
    }
    expect(
      Math.abs(
        showBox.y + showBox.height / 2 - (foldBox.y + foldBox.height / 2),
      ),
      `Fold and Show stay side by side at ${width}px`,
    ).toBeLessThanOrEqual(1);
    expect(
      showBox.width,
      `Show slider is 10% longer than its 12rem version at ${width}px`,
    ).toBeGreaterThanOrEqual(210);
    expect(
      showBox.width,
      `Show slider keeps its 13.2rem target width at ${width}px`,
    ).toBeLessThanOrEqual(213);
    expect(
      showBox.height,
      `Show slider is slightly shorter than Fold at ${width}px`,
    ).toBeLessThan(foldBox.height);
    expect(
      showBox.height,
      `Show slider remains visually comparable to Fold at ${width}px`,
    ).toBeGreaterThanOrEqual(foldBox.height * 0.75);
    expect(showColours.border, "Show border uses the table gold accent").toBe(
      showColours.accent,
    );
    expect(showColours.handle, "Show handle uses the table gold accent").toBe(
      showColours.accent,
    );
    expect(
      showLabelMetrics.whiteSpace,
      `Show label stays on one line at ${width}px`,
    ).toBe("nowrap");
    expect(
      showLabelMetrics.scrollWidth,
      `Show label does not overflow its centered text slot at ${width}px`,
    ).toBeLessThanOrEqual(showLabelMetrics.clientWidth + 1);
    expect(
      showLabelMetrics.textLineCount,
      `Show label has no vertical wrap at ${width}px`,
    ).toBe(1);
    expect(
      showLabelMetrics.textHeight,
      `Show label text stays within the slider height at ${width}px`,
    ).toBeLessThan(showBox.height);
  }

  await alice.setViewportSize({ height: 852, width: 393 });
  const confirmation = alice.getByRole("dialog", {
    name: "Confirm showing cards to table",
  });
  await show.click();
  await expect(confirmation).toHaveCount(0);
  await expect(host.locator("[data-shown-card]")).toHaveCount(0);
  await attachReviewScreenshot(alice, testInfo, "phone-player-show-guard");
  await show.press(" ");
  await expect(confirmation).toHaveCount(0);
  await expect(host.locator("[data-shown-card]")).toHaveCount(0);

  await dragToConfirm(alice, show);
  await expect(host.locator("[data-shown-card]")).toHaveCount(2);
});

test("PLAYER-TABLE-STATUS-001 / PLAYER-PHONE-STATUS-002: Table-side Player keeps only their seat, position, and described state above the hand", async ({
  context,
  page: host,
}, testInfo) => {
  const { alice } = await createTable(host, context);
  await alice.setViewportSize({ height: 852, width: 393 });
  const status = alice.getByLabel("Your table status");
  const statusBar = alice.locator(".player-status-bar");
  const playerBoard = alice.locator(".player-board");
  const boardRail = playerBoard.locator(".dealer-rail");
  const connectionActions = playerBoard.locator(
    ".player-board__connection-actions",
  );
  const openPosition = alice.getByRole("button", {
    name: "See your table position",
  });
  const reconnect = alice.getByRole("button", {
    name: "Reconnect to table",
  });

  await expect(status).toContainText("Seat 1");
  await expect(status).toContainText("Alice");
  await expect(status).toContainText("D Dealer");
  await expect(status).toContainText("SB Small Blind");
  await expect(status).toContainText("Playing");
  await expect(status).not.toContainText("Pre-flop");
  await expect(status).toContainText("Dealer");
  await expect(status).not.toContainText("Big Blind");
  await expect(status.locator(":scope > *")).toHaveCount(2);
  await expect(
    status.getByRole("button", { name: "See your table position" }),
  ).toHaveCount(0);
  await expect(
    statusBar.getByRole("button", { name: "See your table position" }),
  ).toHaveCount(0);
  await expect(
    playerBoard.getByRole("button", { name: "See your table position" }),
  ).toHaveCount(1);
  await expect(
    status.getByRole("button", { name: "Reconnect to table" }),
  ).toHaveCount(0);
  await expect(
    statusBar.getByRole("button", { name: "Reconnect to table" }),
  ).toHaveCount(0);
  await expect(
    playerBoard.getByRole("button", { name: "Reconnect to table" }),
  ).toHaveCount(1);
  await expect(reconnect).toBeDisabled();
  await expect(reconnect).toHaveCSS("opacity", "0.46");
  await attachReviewScreenshot(
    alice,
    testInfo,
    "phone-player-status-reconnect-idle",
  );
  for (const width of [360, 393, 412]) {
    await alice.setViewportSize({ height: 852, width });
    const [
      statusBox,
      summaryBox,
      stateBox,
      stateGlyphBox,
      stateTextBox,
      stateVisualBounds,
      boardBox,
      playerBoardBox,
      connectionActionsBox,
      connectionActionStyle,
      openBox,
      reconnectBox,
    ] = await Promise.all([
      status.boundingBox(),
      status.locator(".player-table-status__summary").boundingBox(),
      status.locator(".player-table-status__state").boundingBox(),
      status.locator(".player-table-status__seat-state").boundingBox(),
      status
        .locator(".player-table-status__state > span:last-child")
        .boundingBox(),
      status
        .locator(".player-table-status__seat-state .seat-state-glyph > span")
        .evaluateAll((layers) => {
          const boxes = layers.map((layer) => layer.getBoundingClientRect());
          if (boxes.length === 0)
            throw new Error("State glyph has no visible layers.");
          return {
            bottom: Math.max(...boxes.map((box) => box.bottom)),
            top: Math.min(...boxes.map((box) => box.top)),
          };
        }),
      boardRail.boundingBox(),
      playerBoard.boundingBox(),
      connectionActions.boundingBox(),
      connectionActions.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          borderTopWidth: style.borderTopWidth,
          paddingTop: Number.parseFloat(style.paddingTop),
        };
      }),
      openPosition.boundingBox(),
      reconnect.boundingBox(),
    ]);
    if (
      !statusBox ||
      !summaryBox ||
      !stateBox ||
      !stateGlyphBox ||
      !stateTextBox ||
      !boardBox ||
      !playerBoardBox ||
      !connectionActionsBox ||
      !openBox ||
      !reconnectBox
    ) {
      throw new Error(
        `Player status and connection controls must be measurable at ${width}px.`,
      );
    }
    expect(
      statusBox.x,
      `Status stays inside the ${width}px viewport`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      statusBox.x + statusBox.width,
      `Status stays inside the ${width}px viewport`,
    ).toBeLessThanOrEqual(width + 1);
    expect(
      Math.abs(
        summaryBox.y +
          summaryBox.height / 2 -
          (stateBox.y + stateBox.height / 2),
      ),
      `Seat, position, and state stay in one row at ${width}px`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        stateGlyphBox.y +
          stateGlyphBox.height / 2 -
          (stateTextBox.y + stateTextBox.height / 2),
      ),
      `State glyph and state text share a horizontal centerline at ${width}px`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        stateVisualBounds.top +
          (stateVisualBounds.bottom - stateVisualBounds.top) / 2 -
          (stateTextBox.y + stateTextBox.height / 2),
      ),
      `Actual state-card outline and Playing text share a centerline at ${width}px`,
    ).toBeLessThanOrEqual(0.25);
    expect(
      openBox.y,
      `Table position action sits below community cards at ${width}px`,
    ).toBeGreaterThanOrEqual(boardBox.y + boardBox.height - 1);
    expect(
      openBox.y - (boardBox.y + boardBox.height),
      `A deliberate gap separates community cards from the utility row at ${width}px`,
    ).toBeGreaterThanOrEqual(20);
    expect(
      Math.abs(
        boardBox.y -
          playerBoardBox.y -
          (connectionActionsBox.y - (boardBox.y + boardBox.height)),
      ),
      `Community cards have equal breathing room between their upper and lower dividers at ${width}px`,
    ).toBeLessThanOrEqual(1.1);
    expect(
      connectionActionStyle.borderTopWidth,
      `A divider separates community cards from the utility row at ${width}px`,
    ).toBe("1px");
    expect(
      connectionActionStyle.paddingTop,
      `The utility row breathes below its divider at ${width}px`,
    ).toBeGreaterThanOrEqual(8);
    expect(
      openBox.x + openBox.width,
      `Table position action stays inside the ${width}px viewport`,
    ).toBeLessThanOrEqual(width + 1);
    expect(
      openBox.y,
      `Table position and Reconnect share a row below community cards at ${width}px`,
    ).toBeGreaterThanOrEqual(boardBox.y + boardBox.height - 1);
    expect(
      Math.abs(
        openBox.y +
          openBox.height / 2 -
          (reconnectBox.y + reconnectBox.height / 2),
      ),
      `Table position and Reconnect share a horizontal centerline at ${width}px`,
    ).toBeLessThanOrEqual(1);
    expect(
      reconnectBox.x + reconnectBox.width,
      `Connection actions stay inside the ${width}px viewport`,
    ).toBeLessThanOrEqual(width + 1);
  }
  await alice.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(status).toContainText("Not connected");
  await expect(reconnect).toBeEnabled();
  await attachReviewScreenshot(
    alice,
    testInfo,
    "phone-player-status-reconnect-needed",
  );
  await reconnect.click();
  await expect(reconnect).toBeDisabled();
  await alice.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await alice.setViewportSize({ height: 852, width: 393 });
  const stateIconClipping = await status
    .locator(".player-table-status__seat-state")
    .evaluate((wrapper) => {
      const wrapperBox = wrapper.getBoundingClientRect();
      const silhouettes = Array.from(
        wrapper.querySelectorAll<HTMLElement>(".seat-state-glyph > span"),
      );
      return {
        overflow: getComputedStyle(wrapper).overflow,
        silhouettes: silhouettes.map((silhouette) => {
          const box = silhouette.getBoundingClientRect();
          return {
            bottom: box.bottom,
            left: box.left,
            right: box.right,
            top: box.top,
          };
        }),
        wrapper: {
          bottom: wrapperBox.bottom,
          left: wrapperBox.left,
          right: wrapperBox.right,
          top: wrapperBox.top,
        },
      };
    });
  expect(stateIconClipping.silhouettes).toHaveLength(2);
  expect(
    stateIconClipping.overflow,
    "the two-card state icon must not be clipped by its wrapper",
  ).not.toBe("hidden");
  for (const silhouette of stateIconClipping.silhouettes) {
    expect(silhouette.left).toBeGreaterThanOrEqual(
      stateIconClipping.wrapper.left - 1,
    );
    expect(silhouette.right).toBeLessThanOrEqual(
      stateIconClipping.wrapper.right + 1,
    );
    expect(silhouette.top).toBeGreaterThanOrEqual(
      stateIconClipping.wrapper.top - 1,
    );
    expect(silhouette.bottom).toBeLessThanOrEqual(
      stateIconClipping.wrapper.bottom + 1,
    );
  }

  await openPosition.click();
  const drawer = alice.getByRole("dialog", { name: "Your table position" });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.locator('[data-seat-id="seat-1"][data-seat-self="true"]'),
  ).toHaveAttribute("data-seat-edge-position", "0");
  const seatTransforms = await drawer
    .locator(".player-position-map [data-seat-id]")
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).transform),
    );
  for (const transform of seatTransforms) {
    const matrix = transform.match(/^matrix\(([^)]+)\)$/u);
    if (!matrix) continue;
    const values = matrix[1]?.split(",").map(Number);
    if (!values || values.length !== 6) {
      throw new Error(`Unexpected seat transform: ${transform}`);
    }
    const [a, b, c, d] = values;
    if (
      a === undefined ||
      b === undefined ||
      c === undefined ||
      d === undefined
    ) {
      throw new Error(`Incomplete seat transform: ${transform}`);
    }
    expect(a).toBeGreaterThan(0);
    expect(d).toBeGreaterThan(0);
    expect(Math.abs(b)).toBeLessThan(0.001);
    expect(Math.abs(c)).toBeLessThan(0.001);
  }
  await attachReviewScreenshot(
    alice,
    testInfo,
    "phone-player-table-status-and-position",
  );
});

test("PLAYER-PHONE-HAND-LAYOUT-001: Table-side Player hand fits real phone widths without a visible title", async ({
  context,
  page: host,
}, testInfo) => {
  const { alice } = await createTable(host, context);

  for (const width of [360, 393, 412]) {
    await alice.setViewportSize({ height: 852, width });
    const hand = alice.locator(".private-hand");
    const title = alice.getByRole("heading", { name: "Your cards" });
    const cards = alice.locator(".private-hand [data-private-card]");
    await expect(title).toHaveCount(1);
    await expect(title).toHaveClass(/visually-hidden/);
    await expect(cards).toHaveCount(2);
    await expect(alice.getByText("Private hand", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      alice.getByText(
        "Reveal them privately, then hide them before passing the phone.",
        { exact: true },
      ),
    ).toHaveCount(0);

    await expect(
      alice.locator('.player-status-bar__connection-row [aria-live="polite"]'),
    ).toHaveCount(0);
    const reconnect = alice.getByRole("button", {
      name: "Reconnect to table",
    });
    const [
      reconnectBox,
      firstCardBox,
      privateCardAreaBox,
      statusBox,
      handDimensions,
    ] = await Promise.all([
      reconnect.boundingBox(),
      cards.first().boundingBox(),
      hand.locator(".private-hand__card-area").boundingBox(),
      alice.getByLabel("Your table status").boundingBox(),
      hand.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    ]);
    if (!reconnectBox || !firstCardBox || !privateCardAreaBox || !statusBox) {
      throw new Error(
        "The Player status, hand, or reconnect button did not render.",
      );
    }
    await expect(reconnect).toBeDisabled();
    expect(handDimensions.scrollWidth).toBeLessThanOrEqual(
      handDimensions.clientWidth,
    );
    expect(
      privateCardAreaBox.y - statusBox.y - statusBox.height,
      `Private cards begin promptly below the compact status at ${width}px`,
    ).toBeLessThanOrEqual(32);
  }

  await alice.setViewportSize({ height: 852, width: 393 });
  await attachReviewScreenshot(alice, testInfo, "phone-player-hand-layout");
});

test("SHOWDOWN-CARD-SELECTION-003: only the winner's selected private cards stay bright and the winner sees a complete five-card hand", async ({
  context,
  page: host,
}, testInfo) => {
  await host.addInitScript(() => {
    let nextByte = 48;
    Object.defineProperty(globalThis.crypto, "getRandomValues", {
      configurable: true,
      value: <T extends ArrayBufferView>(values: T): T => {
        const bytes = new Uint8Array(
          values.buffer,
          values.byteOffset,
          values.byteLength,
        );
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = nextByte;
          nextByte = (nextByte + 73) % 251;
        }
        return values;
      },
    });
  });
  const { alice, bob } = await createTable(host, context);
  await Promise.all([
    alice.setViewportSize({ height: 852, width: 393 }),
    bob.setViewportSize({ height: 852, width: 393 }),
  ]);
  await host.getByRole("button", { name: "Deal the flop" }).click();
  await host.getByRole("button", { name: "Deal the turn" }).click();
  await host.getByRole("button", { name: "Deal the river" }).click();
  await dragToConfirm(
    alice,
    alice.locator('[data-qa-control="player-show-cards"]'),
  );
  await dragToConfirm(
    bob,
    bob.locator('[data-qa-control="player-show-cards"]'),
  );
  await expect(
    host.getByText("Best available shown hand is marked."),
  ).toBeVisible();

  const seatTiles = host.locator(".seat-tile");
  const winnerIndexes = await seatTiles.evaluateAll((tiles) =>
    tiles.flatMap((tile, index) =>
      tile.querySelector(".mini-hand .card--best") ? [index] : [],
    ),
  );
  expect(
    winnerIndexes,
    "the deterministic fixture has exactly one winner",
  ).toHaveLength(1);
  const pages = [alice, bob] as const;
  const winnerIndex = winnerIndexes[0];
  if (winnerIndex !== 0 && winnerIndex !== 1)
    throw new Error("Winner index is unavailable.");
  const winner = pages[winnerIndex];
  const loser = pages[winnerIndex === 0 ? 1 : 0];

  for (const player of pages) {
    const privateCards = player.locator(".private-hand [data-private-card]");
    await expect(privateCards).toHaveCount(2);
    await expect(
      player.locator(
        ".private-hand [data-private-card].card--best, .private-hand [data-private-card].card--unused",
      ),
    ).toHaveCount(2);
  }
  await expect(
    loser.locator(".private-hand [data-private-card].card--best"),
  ).toHaveCount(0);
  await expect(
    loser.locator(".private-hand [data-private-card].card--unused"),
  ).toHaveCount(2);
  const winnerSelectedPrivate = winner.locator(
    ".private-hand [data-private-card].card--best",
  );
  const winnerSelectedBoard = winner.locator(
    ".player-board [data-board-card].card--best",
  );
  const winnerFiveCount =
    (await winnerSelectedPrivate.count()) + (await winnerSelectedBoard.count());
  expect(
    winnerFiveCount,
    "the winning Player view must mark exactly the complete five-card hand",
  ).toBe(5);
  await winner
    .getByRole("button", { name: "Reveal my cards privately" })
    .click();
  await loser
    .getByRole("button", { name: "Reveal my cards privately" })
    .click();
  const selectedPrivateCard = winnerSelectedPrivate.first();
  const fadedPrivateCard = loser
    .locator(".private-hand [data-private-card].card--unused")
    .first();
  const [selectedOpacity, fadedOpacity] = await Promise.all([
    selectedPrivateCard.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).opacity),
    ),
    fadedPrivateCard.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).opacity),
    ),
  ]);
  expect(selectedOpacity).toBeGreaterThan(fadedOpacity);
  await attachReviewScreenshot(winner, testInfo, "phone-player-selected-hand");
});

test("Table-side Mode limits display-name entry to a readable table label", async ({
  context,
  page: host,
}) => {
  await host.goto("/");
  await host.getByRole("button", { name: "Create table" }).click();
  const invitationUrl = await host
    .getByLabel("Player invitation link")
    .inputValue();
  const player = await context.newPage();
  await player.goto(invitationUrl);
  const displayName = player.getByLabel("Display name");
  const overlongName = "This display name is intentionally much too long";

  await expect(displayName).toHaveAttribute("maxlength", "24");
  await displayName.fill(overlongName);
  await expect(displayName).toHaveValue(overlongName.slice(0, 24));
});

test("DECK-APPEARANCE-001: Trusted Host synchronizes the built-in deck appearance while phone board cards remain concise", async ({
  context,
  page: host,
}, testInfo: TestInfo) => {
  await host.setViewportSize({ height: 852, width: 393 });
  await host.addInitScript(() => {
    // A deterministic shuffle makes this a real four-suit browser check, not
    // a one-card colour assertion. It is isolated to this QA browser context.
    let nextByte = 31;
    Object.defineProperty(globalThis.crypto, "getRandomValues", {
      configurable: true,
      value: <T extends ArrayBufferView>(values: T): T => {
        const bytes = new Uint8Array(
          values.buffer,
          values.byteOffset,
          values.byteLength,
        );
        // Card custody asks for exactly one random byte per Fisher-Yates swap.
        // Leave unrelated UUID, IV, and diagnostics entropy alone so their
        // implementation cannot shift the deck QA fixture.
        if (bytes.length !== 1) return values;
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = nextByte;
          nextByte = (nextByte + 1) % 251;
        }
        return values;
      },
    });
  });
  const { alice } = await createTable(host, context);
  await alice.setViewportSize({ height: 852, width: 393 });
  await host.getByRole("button", { name: "Deal the flop" }).click();
  await host.getByRole("button", { name: "Deal the turn" }).click();
  await host.getByRole("button", { name: "Deal the river" }).click();
  await expect(alice.locator(".player-board [data-board-card]")).toHaveCount(5);

  await host.getByRole("button", { name: "Open table control center" }).click();
  const controlCenter = host.getByRole("dialog", {
    name: "Table control center",
  });
  await expect(
    controlCenter.getByRole("group", { name: "Deck appearance" }),
  ).toBeVisible();
  await exerciseControl(
    "card-style-four-colour",
    controlCenter.getByRole("button", { name: "Four Colour" }),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-card-style",
        "four-colour",
      ),
  );
  await expect(host.locator(".table-surface")).toHaveAttribute(
    "data-card-style",
    "four-colour",
  );
  await expect(alice.locator(".table-surface")).toHaveAttribute(
    "data-card-style",
    "four-colour",
  );

  const fourColourFaces = await alice
    .locator(".player-board [data-board-card]")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        color: getComputedStyle(element).color,
        suit: [...element.classList].find((name) =>
          name.startsWith("card--suit-"),
        ),
      })),
    );
  const expectedFourColour: Record<string, string> = {
    "card--suit-c": "rgb(32, 127, 89)",
    "card--suit-d": "rgb(39, 120, 197)",
    "card--suit-h": "rgb(201, 59, 67)",
    "card--suit-s": "rgb(27, 36, 48)",
  };
  const visibleSuitColours = new Map(
    fourColourFaces.flatMap(({ color, suit }) =>
      suit ? [[suit, color] as const] : [],
    ),
  );
  // A random real hand need not contain all four suits. It must still show
  // distinct colours for every suit that is actually present, and the same
  // browser/CSS build must expose the complete four-suit mapping below.
  expect(visibleSuitColours.size).toBeGreaterThanOrEqual(2);
  for (const [suit, colour] of visibleSuitColours) {
    expect(colour).toBe(expectedFourColour[suit]);
  }
  const allSuitColours = await alice.evaluate((expected) => {
    const fixture = document.createElement("div");
    fixture.className = "table-surface";
    fixture.dataset.cardStyle = "four-colour";
    fixture.style.cssText = "position:fixed; left:-9999px; top:-9999px";
    const suits = Object.keys(expected);
    for (const suit of suits) {
      const card = document.createElement("div");
      card.className = `card card--suit-${suit.slice(-1)}`;
      fixture.append(card);
    }
    document.body.append(fixture);
    const colours = suits.map((suit, index) => [
      suit,
      getComputedStyle(fixture.children[index]!).color,
    ]);
    fixture.remove();
    return Object.fromEntries(colours);
  }, expectedFourColour);
  expect(allSuitColours).toEqual(expectedFourColour);

  // Table-side Mode uses the approved full face set for private phone cards and
  // the shared-table community rail. The compact phone board remains the
  // intentionally separate rank-and-suit reading rail above.
  const fourColourPrivateFaces = alice.locator(
    ".private-hand [data-private-card]",
  );
  await expect(fourColourPrivateFaces).toHaveCount(2);
  for (const privateFace of await fourColourPrivateFaces.all()) {
    await expect(privateFace).toHaveClass(/card--svg-face/);
  }
  const fourColourPrivateSources = await fourColourPrivateFaces
    .locator(".card__face-svg")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("src")),
    );
  expect(fourColourPrivateSources).toHaveLength(2);
  expect(
    fourColourPrivateSources.every((src) =>
      src?.includes("/four-colour/faces/"),
    ),
  ).toBe(true);
  await expectSvgFacesLoaded(fourColourPrivateFaces.locator(".card__face-svg"));
  await expectFiveBySevenCardGeometry(fourColourPrivateFaces);

  await controlCenter
    .getByRole("button", { name: "Close table control center" })
    .click();
  await host.getByRole("button", { name: "Table View" }).click();
  const fourColourTableFaces = host.locator(".public-table [data-board-card]");
  await expect(fourColourTableFaces).toHaveCount(5);
  for (const tableFace of await fourColourTableFaces.all()) {
    await expect(tableFace).toHaveClass(/card--svg-face/);
  }
  await expect(fourColourTableFaces.locator(".card__face-svg")).toHaveCount(5);
  const fourColourTableSources = await fourColourTableFaces
    .locator(".card__face-svg")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("src")),
    );
  expect(
    fourColourTableSources.every((src) => src?.includes("/four-colour/faces/")),
  ).toBe(true);
  await expectSvgFacesLoaded(fourColourTableFaces.locator(".card__face-svg"));
  await expectFiveBySevenCardGeometry(fourColourTableFaces);
  await host
    .getByRole("button", { name: "Open table controls from lower right" })
    .click();
  await host.getByRole("button", { name: "More table controls" }).click();
  await host.getByRole("button", { name: "Host Controls" }).click();
  await host.getByRole("button", { name: "Open table control center" }).click();
  await expect(controlCenter).toBeVisible();
  await screenshotEveryProject(alice, "phone-four-colour-deck");

  await exerciseControl(
    "card-style-classic",
    controlCenter.getByRole("button", { name: "Classic" }),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-card-style",
        "classic",
      ),
  );
  await expect(host.locator(".table-surface")).toHaveAttribute(
    "data-card-style",
    "classic",
  );
  await expect(alice.locator(".table-surface")).toHaveAttribute(
    "data-card-style",
    "classic",
  );
  // Full-size Classic court illustrations are covered by the component
  // contract. At this browser seam, the relevant user-facing guarantee is
  // that the Player Experience rail remains deliberately rank-and-suit only.
  await expect(
    alice.locator('.player-board [data-court-rank="Q"]'),
  ).toHaveCount(0);
  await expect(
    alice.locator(".player-board [data-board-card] .card__pip").first(),
  ).toBeHidden();
  const classicPrivateSources = await alice
    .locator(".private-hand [data-private-card] .card__face-svg")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("src")),
    );
  expect(classicPrivateSources).toHaveLength(2);
  expect(
    classicPrivateSources.every((src) => src?.includes("/classic/faces/")),
  ).toBe(true);
  await expectSvgFacesLoaded(
    alice.locator(".private-hand [data-private-card] .card__face-svg"),
  );
  await screenshotIfChromium(alice, testInfo, "phone-deck-appearance");
});

test("PHONE-CROSS-BROWSER-CARD-001: the actual Table-side Mode six shares the compact group baseline", async ({
  context,
  page: host,
}, testInfo: TestInfo) => {
  await host.addInitScript(() => {
    // The resulting board is A♣, Q♣, 9♠, 5♦, 6♥. Only one-byte Card Custody
    // randomness is controlled, so unrelated browser/runtime entropy cannot
    // perturb this real application fixture.
    let nextByte = 31;
    Object.defineProperty(globalThis.crypto, "getRandomValues", {
      configurable: true,
      value: <T extends ArrayBufferView>(values: T): T => {
        const bytes = new Uint8Array(
          values.buffer,
          values.byteOffset,
          values.byteLength,
        );
        if (bytes.length !== 1) return values;
        bytes[0] = nextByte;
        nextByte = (nextByte + 1) % 251;
        return values;
      },
    });
  });
  const { alice } = await createTable(host, context);
  await host.getByRole("button", { name: "Deal the flop" }).click();
  await host.getByRole("button", { name: "Deal the turn" }).click();
  await host.getByRole("button", { name: "Deal the river" }).click();

  const expectedBoard = ["Ac", "Qc", "9s", "5d", "6h"];
  const viewports = [
    { height: 780, width: 360 },
    { height: 852, width: 393 },
    { height: 915, width: 412 },
  ];
  for (const viewport of viewports) {
    await host.setViewportSize(viewport);
    await alice.setViewportSize(viewport);
    for (const [surface, cards] of [
      ["Host Controls", host.locator(".public-table [data-board-card]")],
      ["Player", alice.locator(".player-board [data-board-card]")],
    ] as const) {
      await expect(cards).toHaveCount(5);
      const metrics = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const card = element.getBoundingClientRect();
          const group =
            element.querySelector<HTMLElement>(".card__corner--top")!;
          const groupBox = group.getBoundingClientRect();
          return {
            card: element.getAttribute("data-card"),
            courtFaces: element.querySelectorAll(".card__court").length,
            fullFaceImages: element.querySelectorAll(".card__face-svg").length,
            groupOffset: groupBox.top - card.top,
            groupTransform: getComputedStyle(group).transform,
          };
        }),
      );
      expect(metrics.map((metric) => metric.card)).toEqual(expectedBoard);
      expect(metrics.every((metric) => metric.courtFaces === 0)).toBe(true);
      expect(metrics.every((metric) => metric.fullFaceImages === 0)).toBe(true);
      const six = metrics.find((metric) => metric.card === "6h");
      const otherOffsets = metrics
        .filter((metric) => metric.card !== "6h")
        .map((metric) => metric.groupOffset);
      if (!six || otherOffsets.length !== 4) {
        throw new Error(
          `${surface} did not render the deterministic six card.`,
        );
      }
      expect(six.groupTransform).toBe("none");
      for (const offset of otherOffsets) {
        expect(Math.abs(six.groupOffset - offset)).toBeLessThanOrEqual(0.1);
      }
    }
    await attachCompactCardReviewImage(alice, testInfo, viewport);
  }

  await dragToConfirm(
    alice,
    alice.locator('[data-qa-control="player-show-cards"]'),
  );
  const compactCourt = host.locator('.mini-hand [data-card="Jd"]');
  await expect(compactCourt).toHaveCount(1);
  await expect(compactCourt.locator(".card__court")).toHaveCount(0);
  await expect(compactCourt.locator(".card__face-svg")).toHaveCount(0);
});

test("registered phone, tablet, desktop, and TV viewports remain free of clipping and horizontal overflow", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile-webkit",
    "The iPhone-WebKit profile is covered by dedicated phone card and control journeys; it cannot faithfully exercise this multi-role Tablet/TV viewport matrix.",
  );
  const { alice } = await createTable(host, context);
  await alice
    .getByRole("button", { name: "Reveal my cards privately" })
    .click();

  async function expectNoHorizontalOverflow(page: Page): Promise<void> {
    expect(
      await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollWidth - innerWidth),
      ),
    ).toBe(0);
  }

  for (const viewport of [
    { height: 780, width: 360 },
    { height: 852, width: 393 },
  ]) {
    await alice.setViewportSize(viewport);
    await expectNoHorizontalOverflow(alice);
    const cards = await alice.locator("[data-private-card]").all();
    await expect(alice.locator("[data-private-card]")).toHaveCount(2);
    for (const card of cards) {
      const rendered = await card.boundingBox();
      expect(rendered).not.toBeNull();
      if (rendered) {
        expect(rendered.x).toBeGreaterThanOrEqual(0);
        expect(rendered.x + rendered.width).toBeLessThanOrEqual(
          viewport.width + 0.5,
        );
      }
    }
    await expect(
      alice.getByRole("button", { name: "Hide my cards" }),
    ).toBeVisible();
  }

  await alice.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectNoHorizontalOverflow(alice);
  await expect(
    alice.getByRole("button", { name: "Hide my cards" }),
  ).toBeVisible();

  await host.setViewportSize({ height: 1_000, width: 1_440 });
  await expectNoHorizontalOverflow(host);
  await host.getByRole("button", { name: "Deal the flop" }).click();
  await host.getByRole("button", { name: "Deal the turn" }).click();
  await host.getByRole("button", { name: "Deal the river" }).click();
  await host.getByRole("button", { name: "Table View" }).click();

  for (const viewport of [
    { height: 1_024, width: 1_366 },
    { height: 1_080, width: 1_920 },
  ]) {
    await host.setViewportSize(viewport);
    await expectNoHorizontalOverflow(host);
    await expect(host.locator("[data-board-card]")).toHaveCount(5);
    await expect(host.locator("[data-table-corner]")).toHaveCount(4);
    for (const card of await host.locator("[data-board-card]").all()) {
      const rendered = await card.boundingBox();
      expect(rendered).not.toBeNull();
      if (rendered) {
        expect(rendered.x).toBeGreaterThanOrEqual(0);
        expect(rendered.x + rendered.width).toBeLessThanOrEqual(
          viewport.width + 0.5,
        );
      }
    }
  }
});

test("Trusted Host can dissolve a table and its saved authority cannot be recovered", async ({
  context,
  page: host,
}) => {
  const { alice } = await createTable(host, context);
  const recoveryUrl = host.url();

  await host.getByRole("button", { name: "Open table control center" }).click();
  const dissolve = host.getByRole("button", { name: "Dissolve table" });
  await expect(dissolve).toBeVisible();
  await exerciseControl(
    "host-dissolve-table",
    dissolve,
    async (target) => {
      host.once("dialog", (dialog) => dialog.accept());
      await target.click();
    },
    () =>
      expect(host.getByRole("button", { name: "Create table" })).toBeVisible(),
  );
  expect(new URL(host.url()).hash).toBe("");
  await expect
    .poll(() =>
      alice.getByRole("button", { name: "Reconnect to table" }).isVisible(),
    )
    .toBe(true);

  const staleHost = await context.newPage();
  await staleHost.goto(recoveryUrl);
  await expect(
    staleHost.getByRole("heading", {
      name: "This saved table cannot be opened",
    }),
  ).toBeVisible();
  await expect(
    staleHost.getByText("No saved Trusted Host table was found."),
  ).toBeVisible();
});

test("Table-side Host can dissolve a table from the Players control drawer", async ({
  context,
  page: host,
}, testInfo) => {
  const { alice } = await createTable(host, context);

  await host.getByRole("button", { name: /^Players/ }).click();
  const playerAdministration = host.getByRole("complementary", {
    name: "Player administration",
  });
  const dissolve = playerAdministration.getByRole("button", {
    name: "Dissolve table",
  });
  await expect(dissolve).toBeVisible();
  const drawerEvidence = testInfo.outputPath(
    "phone-host-dissolve-drawer-visible.png",
  );
  await host.screenshot({ path: drawerEvidence });
  await testInfo.attach("phone-host-dissolve-drawer-visible", {
    contentType: "image/png",
    path: drawerEvidence,
  });

  await exerciseControl(
    "host-dissolve-table-drawer",
    dissolve,
    async (target) => {
      host.once("dialog", (dialog) => dialog.accept());
      await target.click();
    },
    async () => {
      await expect(
        host.getByRole("button", { name: "Create table" }),
      ).toBeVisible();
      await expect
        .poll(() =>
          alice.getByRole("button", { name: "Reconnect to table" }).isVisible(),
        )
        .toBe(true);
    },
  );
});

test("Table-side Host makes player invitations and replacements visible in the Players sheet", async ({
  context,
  page: host,
}, testInfo: TestInfo) => {
  await host.setViewportSize({ height: 852, width: 393 });
  await host.addInitScript(() => {
    let nextByte = 48;
    Object.defineProperty(globalThis.crypto, "getRandomValues", {
      configurable: true,
      value: <T extends ArrayBufferView>(values: T): T => {
        const bytes = new Uint8Array(
          values.buffer,
          values.byteOffset,
          values.byteLength,
        );
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = nextByte;
          nextByte = (nextByte + 73) % 251;
        }
        return values;
      },
    });
  });
  await createTable(host, context);

  const tableControls = host.getByRole("button", {
    name: "Open table control center",
  });
  await expect(tableControls).toContainText("Table controls");
  const tableControlsEvidence = testInfo.outputPath(
    "phone-host-table-controls-visible.png",
  );
  await host.screenshot({ path: tableControlsEvidence });
  await testInfo.attach("phone-host-table-controls-visible", {
    contentType: "image/png",
    path: tableControlsEvidence,
  });

  await host.getByRole("button", { name: /^Players/u }).click();
  const administration = host.getByRole("complementary", {
    name: "Player administration",
  });
  const invite = administration.locator(".invite-panel");
  await expect(
    invite.getByRole("heading", { name: "Add a player" }),
  ).toBeVisible();
  await expect(invite.getByLabel("Player invitation link")).toBeVisible();
  await expect(invite).toBeInViewport();

  const joinWindowToggle = administration.locator(
    '[data-qa-control="roster-join-window-toggle"]',
  );
  await exerciseControl(
    "roster-join-window-toggle",
    joinWindowToggle,
    (target) => target.click(),
    async () => {
      await expect(
        invite.getByRole("heading", { name: "New players locked" }),
      ).toBeVisible();
      await expect(invite).toBeInViewport();
      await expect(joinWindowToggle).toHaveAccessibleName("Allow new players");
    },
  );
  await exerciseControl(
    "roster-join-window-toggle",
    joinWindowToggle,
    (target) => target.click(),
    async () => {
      await expect(
        invite.getByRole("heading", { name: "Add a player" }),
      ).toBeVisible();
      await expect(invite.getByLabel("Player invitation link")).toBeVisible();
      await expect(invite).toBeInViewport();
    },
  );
  const invitationBox = await invite.boundingBox();
  expect(invitationBox).not.toBeNull();
  expect(invitationBox?.y).toBeGreaterThanOrEqual(70);
  expect(invitationBox?.y).toBeLessThan(140);
  const addPlayerEvidence = testInfo.outputPath(
    "phone-host-add-player-visible.png",
  );
  await host.screenshot({ path: addPlayerEvidence });
  await testInfo.attach("phone-host-add-player-visible", {
    contentType: "image/png",
    path: addPlayerEvidence,
  });

  await joinPlayer(host, context, "Carol");
  await expect(
    administration.getByText("3 of 10 joined", { exact: true }),
  ).toBeVisible();

  await administration.getByRole("button", { name: /^Seat 2, Bob,/u }).click();
  await administration.getByRole("button", { name: "Replace device" }).click();
  await expect(
    invite.getByRole("heading", { name: "Replace Bob's device" }),
  ).toBeVisible();
  await expect(invite.getByLabel("Player replacement link")).toBeVisible();
  await expect(invite).toBeInViewport();
  const replacementBox = await invite.boundingBox();
  expect(replacementBox).not.toBeNull();
  expect(replacementBox?.y).toBeGreaterThanOrEqual(70);
  expect(replacementBox?.y).toBeLessThan(140);
  const replacementEvidence = testInfo.outputPath(
    "phone-host-replace-device-visible.png",
  );
  await host.screenshot({ path: replacementEvidence });
  await testInfo.attach("phone-host-replace-device-visible", {
    contentType: "image/png",
    path: replacementEvidence,
  });
});
