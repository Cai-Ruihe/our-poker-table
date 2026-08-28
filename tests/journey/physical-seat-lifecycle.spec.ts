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

test("permanent departure preserves surviving physical seats and reuses the vacancy", async ({
  context,
  page: host,
}, testInfo) => {
  await host.goto("/");
  await host.getByRole("button", { name: "Create table" }).click();
  const alice = await joinPlayer(host, context, "Alice");
  await joinPlayer(host, context, "Bob");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await expect(alice.locator("[data-private-card]")).toHaveCount(2);

  await alice.getByRole("button", { name: "Open leave options" }).click();
  await alice
    .getByRole("slider", { name: "Leave table permanently" })
    .press("End");
  await alice
    .getByRole("dialog", { name: "Leave this table?" })
    .getByRole("button", { name: "Leave permanently" })
    .click();
  await expect(
    alice.getByRole("heading", { name: "Join another session" }),
  ).toBeVisible();

  await host.getByRole("button", { name: "End hand" }).click();
  await host.getByRole("button", { name: "End this hand" }).click();
  const bob = host.locator(".seat-tile").filter({ hasText: "Bob" });
  await expect(bob).toContainText("Seat 2");
  await expect(
    host.locator(".seat-tile").filter({ hasText: "Alice" }),
  ).toHaveCount(0);

  await host.getByRole("button", { name: /^Players/u }).click();
  const faye = await joinPlayer(host, context, "Faye");
  await expect(faye.getByText("Seat 1", { exact: true })).toBeVisible();
  await expect(bob).toContainText("Seat 2");
  await host.screenshot({
    fullPage: true,
    path: capturePath(testInfo, "physical-seat-vacancy-reused.png"),
  });
});
