import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { exerciseControl } from "./control-qa";

function capturePath(
  testInfo: { outputPath: (name: string) => string },
  name: string,
): string {
  const directory = process.env.HTML_POKER_CAPTURE_DIR;
  return directory ? `${directory}/${name}` : testInfo.outputPath(name);
}

async function joinPlayer(
  host: Page,
  context: BrowserContext,
  name: string,
): Promise<Page> {
  const invitation = await host
    .getByLabel("Player invitation link")
    .inputValue();
  const player = await context.newPage();
  await player.goto(invitation, { waitUntil: "commit" });
  await player.getByLabel("Display name").fill(name);
  await player.getByRole("button", { name: "Join table" }).click();
  await expect(
    player.getByRole("heading", { name: "You have a seat" }),
  ).toBeVisible();
  return player;
}

test("Table-side Player keeps language separate from the leave options", async ({
  context,
  page: host,
}, testInfo) => {
  await host.goto("/");
  await host.getByRole("button", { name: "Create table" }).click();
  const alice = await joinPlayer(host, context, "Alice");
  await joinPlayer(host, context, "Bob");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await expect(alice.locator("[data-private-card]")).toHaveCount(2);
  await alice.setViewportSize({ width: 390, height: 844 });

  const board = alice.locator(".player-board .dealer-rail");
  const languageTrigger = alice.locator(
    '[data-qa-control="surface-language-menu-open"]',
  );
  const leaveOptions = alice.getByRole("button", {
    name: "Open leave options",
  });
  await expect(languageTrigger).toBeVisible();
  const [boardBox, languageBox] = await Promise.all([
    board.boundingBox(),
    languageTrigger.boundingBox(),
  ]);
  if (!boardBox || !languageBox)
    throw new Error("Player utility controls must render.");
  expect(languageBox.y).toBeGreaterThanOrEqual(
    boardBox.y + boardBox.height - 1,
  );

  await exerciseControl(
    "surface-language-menu-open",
    languageTrigger,
    (control) => control.click(),
    async () => {
      await expect(
        alice.locator(
          ".surface-language-menu__panel[data-language-switch], .surface-language-menu__panel [data-language-switch]",
        ),
      ).toBeVisible();
    },
  );
  await alice.screenshot({
    fullPage: true,
    path: capturePath(testInfo, "player-language-menu-390x844.png"),
  });
  await languageTrigger.click();

  await leaveOptions.click();
  const drawer = alice.getByRole("dialog", { name: "Leave options" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("[data-language-switch]")).toHaveCount(0);
  await alice.screenshot({
    fullPage: true,
    path: capturePath(
      testInfo,
      "player-leave-menu-without-language-390x844.png",
    ),
  });
});
