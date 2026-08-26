import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

type Viewport = { readonly width: number; readonly height: number };
type Box = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

function capturePath(
  testInfo: { outputPath: (name: string) => string },
  name: string,
): string {
  const directory = process.env.HTML_POKER_CAPTURE_DIR;
  return directory ? `${directory}/${name}` : testInfo.outputPath(name);
}

function overlaps(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

async function box(locator: Locator): Promise<Box> {
  const value = await locator.boundingBox();
  expect(value, "expected a rendered element").not.toBeNull();
  if (!value) throw new Error("Expected a rendered element.");
  return value;
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
  await player.goto(invitation, { waitUntil: "commit" });
  await player.getByLabel("Display name").fill(displayName);
  await player.getByRole("button", { name: "Join table" }).click();
  await expect(
    player.getByRole("heading", { name: "You have a seat" }),
  ).toBeVisible();
  return player;
}

async function createTable(host: Page, context: BrowserContext): Promise<Page> {
  await host.goto("/", { waitUntil: "commit" });
  await host.getByRole("button", { name: "Create table" }).click();
  const alice = await joinPlayer(host, context, "Alice");
  await joinPlayer(host, context, "Bob");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await expect(alice.locator("[data-private-card]")).toHaveCount(2);
  await host.getByRole("button", { name: "Deal the flop" }).click();
  await host.getByRole("button", { name: "Deal the turn" }).click();
  await host.getByRole("button", { name: "Deal the river" }).click();
  return alice;
}

async function showCards(player: Page): Promise<void> {
  const slider = player.locator('[data-qa-control="player-show-cards"]');
  const target = await box(slider);
  await player.mouse.move(target.x + 20, target.y + target.height / 2);
  await player.mouse.down();
  await player.mouse.move(
    target.x + target.width - 16,
    target.y + target.height / 2,
    { steps: 8 },
  );
  await player.mouse.up();
}

async function expectLaunchersFlush(
  page: Page,
  viewport: Viewport,
): Promise<void> {
  const launchers = page.locator("[data-table-corner]");
  await expect(launchers).toHaveCount(4);
  for (const launcher of await launchers.all()) {
    const target = await box(launcher);
    expect(
      Math.min(target.x, target.y),
      "launcher must not leave the viewport",
    ).toBeGreaterThanOrEqual(0);
    expect(
      target.x + target.width,
      "launcher must reach the right viewport edge or remain inside",
    ).toBeLessThanOrEqual(viewport.width + 1);
    expect(
      target.y + target.height,
      "launcher must reach the bottom viewport edge or remain inside",
    ).toBeLessThanOrEqual(viewport.height + 1);
  }
  const positions = await launchers.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(innerWidth - rect.right),
        bottom: Math.round(innerHeight - rect.bottom),
      };
    }),
  );
  expect(positions).toEqual([
    {
      left: 0,
      top: 0,
      right: viewport.width - 68,
      bottom: viewport.height - 68,
    },
    {
      left: viewport.width - 68,
      top: 0,
      right: 0,
      bottom: viewport.height - 68,
    },
    {
      left: 0,
      top: viewport.height - 68,
      right: viewport.width - 68,
      bottom: 0,
    },
    {
      left: viewport.width - 68,
      top: viewport.height - 68,
      right: 0,
      bottom: 0,
    },
  ]);
  const glyphGeometry = await launchers.evaluateAll((elements) =>
    elements.map((element) => {
      const span = element.querySelector("span");
      if (!span) throw new Error("Expected a corner glyph span.");
      const spanStyle = getComputedStyle(span);
      const dotStyle = getComputedStyle(element, "::after");
      const px = (value: string) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? Math.round(parsed) : 0;
      };
      return {
        borderBottom: px(spanStyle.borderBottomWidth),
        borderLeft: px(spanStyle.borderLeftWidth),
        borderRight: px(spanStyle.borderRightWidth),
        borderTop: px(spanStyle.borderTopWidth),
        dotBottom: px(dotStyle.bottom),
        dotLeft: px(dotStyle.left),
        dotRight: px(dotStyle.right),
        dotTop: px(dotStyle.top),
        spanBottom: px(spanStyle.bottom),
        spanLeft: px(spanStyle.left),
        spanRight: px(spanStyle.right),
        spanTop: px(spanStyle.top),
      };
    }),
  );
  expect(
    glyphGeometry,
    "all four corner glyphs use mirrored L-and-dot geometry",
  ).toEqual([
    {
      borderBottom: 0,
      borderLeft: 3,
      borderRight: 0,
      borderTop: 3,
      dotBottom: 45,
      dotLeft: 48,
      dotRight: 16,
      dotTop: 19,
      spanBottom: 24,
      spanLeft: 20,
      spanRight: 24,
      spanTop: 20,
    },
    {
      borderBottom: 0,
      borderLeft: 0,
      borderRight: 3,
      borderTop: 3,
      dotBottom: 45,
      dotLeft: 16,
      dotRight: 48,
      dotTop: 19,
      spanBottom: 24,
      spanLeft: 24,
      spanRight: 20,
      spanTop: 20,
    },
    {
      borderBottom: 3,
      borderLeft: 3,
      borderRight: 0,
      borderTop: 0,
      dotBottom: 19,
      dotLeft: 48,
      dotRight: 16,
      dotTop: 45,
      spanBottom: 20,
      spanLeft: 20,
      spanRight: 24,
      spanTop: 24,
    },
    {
      borderBottom: 3,
      borderLeft: 0,
      borderRight: 3,
      borderTop: 0,
      dotBottom: 19,
      dotLeft: 16,
      dotRight: 48,
      dotTop: 45,
      spanBottom: 20,
      spanLeft: 24,
      spanRight: 20,
      spanTop: 24,
    },
  ]);
}

async function expectShownHandsClearBoard(page: Page): Promise<void> {
  const shownCards = await Promise.all(
    (await page.locator(".quiet-shown-hand .card--quiet-shown").all()).map(box),
  );
  const boardCards = await Promise.all(
    (await page.locator("[data-board-card]").all()).map(box),
  );
  expect(shownCards.length).toBeGreaterThan(0);
  for (const shown of shownCards) {
    for (const board of boardCards) {
      expect(
        overlaps(shown, board),
        "shown private cards must not collide with community cards",
      ).toBe(false);
    }
  }
}

test.describe("iPad Tablet surface geometry", () => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1180, height: 820 },
  ] as const) {
    test(`keeps tablet controls and shown hands clear at ${viewport.width}x${viewport.height}`, async ({
      context,
      page: host,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== "chromium",
        "The focused visual geometry fixture runs in Chromium.",
      );
      await host.setViewportSize(viewport);
      const alice = await createTable(host, context);
      await showCards(alice);
      await expect(
        alice.getByText("Shown to table", { exact: true }),
      ).toBeVisible();
      await host.getByRole("button", { name: "Table View" }).click();
      const surface = host.locator(".table-surface");
      await expect(surface).toHaveClass(/table-surface--tablet/u);

      await expectLaunchersFlush(host, viewport);
      await expectShownHandsClearBoard(host);

      const bottomSeat = host
        .locator(
          ".seat-edge-status:is(.seat-edge-status--5, .seat-edge-status--6, .seat-edge-status--7)",
        )
        .first();
      const bottomSeatBox = await box(bottomSeat);
      expect(
        viewport.height - (bottomSeatBox.y + bottomSeatBox.height),
        "bottom status should sit against the usable iPad viewport edge",
      ).toBeLessThanOrEqual(2);

      for (const fullscreen of ["false", "true"] as const) {
        if (fullscreen === "true") {
          await surface.evaluate((element) =>
            element.setAttribute("data-page-fullscreen", "true"),
          );
          await host.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve()),
                ),
              ),
          );
        }
        await expectLaunchersFlush(host, viewport);
        await expect(host.locator("[data-board-card]")).toHaveCount(5);
        const boardOpacity = await host
          .locator("[data-board-card]")
          .first()
          .evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).opacity),
          );
        expect(
          boardOpacity,
          "a faded, unused community card must remain visibly rendered",
        ).toBeGreaterThanOrEqual(0.4);
        await expect(
          host.locator(".quiet-shown-hand .card--quiet-shown"),
        ).toHaveCount(2);
        for (const card of await host.locator("[data-board-card]").all()) {
          const cardBox = await box(card);
          expect(
            cardBox.width,
            "a fullscreen board card must retain width",
          ).toBeGreaterThan(1);
          expect(
            cardBox.height,
            "a fullscreen board card must retain height",
          ).toBeGreaterThan(1);
          expect(
            cardBox.x + cardBox.width,
            "a fullscreen board card must remain on-screen",
          ).toBeGreaterThan(0);
          expect(
            cardBox.y + cardBox.height,
            "a fullscreen board card must remain on-screen",
          ).toBeGreaterThan(0);
          expect(
            cardBox.x,
            "a fullscreen board card must remain on-screen",
          ).toBeLessThan(viewport.width);
          expect(
            cardBox.y,
            "a fullscreen board card must remain on-screen",
          ).toBeLessThan(viewport.height);
        }
        await host.screenshot({
          path: capturePath(
            testInfo,
            `ipad-${viewport.width}x${viewport.height}-fullscreen-${fullscreen}.png`,
          ),
          animations: "disabled",
        });
      }
    });
  }
});
