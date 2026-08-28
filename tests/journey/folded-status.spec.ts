import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

function capturePath(testInfo: TestInfo, name: string): string {
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

test("a folded tablet seat keeps the card glyph and adds a clear red diagonal", async ({
  context,
  page: host,
}, testInfo) => {
  await host.goto("/");
  await host.getByRole("button", { name: "Create table" }).click();
  await joinPlayer(host, context, "Alice");
  const bob = await joinPlayer(host, context, "Bob");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await bob.getByRole("button", { name: "Fold", exact: true }).click();
  await expect(bob.getByText("Folded", { exact: true })).toBeVisible();

  await host.setViewportSize({ width: 1024, height: 768 });
  await host.getByRole("button", { name: "Table View" }).click();
  const foldedGlyph = host.locator(".seat-state-glyph--folded");
  await expect(foldedGlyph).toBeVisible();
  await expect(foldedGlyph).toHaveCSS("opacity", "0.86");
  const stripe = await foldedGlyph.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    return {
      background: style.backgroundColor,
      height: Number.parseFloat(style.height),
      width: Number.parseFloat(style.width),
    };
  });
  expect(stripe.background).toBe("rgb(239, 98, 81)");
  expect(stripe.height).toBeGreaterThanOrEqual(3);
  expect(stripe.width).toBeGreaterThan(30);
  await host.screenshot({
    fullPage: true,
    path: capturePath(testInfo, "tablet-folded-state-red-slash-1024x768.png"),
  });
});
