import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function joinPlayer(
  host: Page,
  context: BrowserContext,
  displayName: string,
): Promise<void> {
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
}

test("the accepted Our Poker Table identity is used on entry and host surfaces", async ({
  context,
  page: host,
}) => {
  await host.goto("/");

  await expect(host).toHaveTitle(
    "Our Poker Table — Digital dealer for physical tables",
  );
  await expect(
    host.locator(".brand-bar").getByRole("img", {
      name: "Our Poker Table",
    }),
  ).toBeVisible();
  await expect(
    host.getByRole("link", { name: "Open Our Poker Table introduction" }),
  ).toHaveAttribute("href", "../intro/");
  await expect(host.locator(".brand-bar")).not.toContainText("HTML Poker");
  await expect(host.locator('head link[rel="icon"]')).toHaveAttribute(
    "href",
    /favicon/u,
  );

  await host.getByRole("button", { name: "Create table" }).click();
  await joinPlayer(host, context, "Alice");
  await joinPlayer(host, context, "Bob");
  await host.getByRole("button", { name: "Deal first hand" }).click();

  const inHandBrand = host.locator(".table-mark");
  await expect(
    host.getByRole("button", { name: "Open table control center" }),
  ).toBeVisible();
  await expect(inHandBrand.locator(".table-mark__symbol")).toBeVisible();
  await expect(inHandBrand).toContainText("Our Poker Table");
  await expect(inHandBrand).not.toContainText("HTML Poker");
});

test("the canonical lockup and compact phone identity respect brand minimum sizes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.goto("/");

  const wordmark = page.locator(".brand-lockup__wordmark");
  const compactIdentity = page.locator(".brand-lockup__compact");
  await expect(wordmark).toBeVisible();
  await expect(compactIdentity).toBeHidden();
  await expect
    .poll(async () => (await wordmark.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(239);

  await page.setViewportSize({ width: 393, height: 852 });
  await expect(wordmark).toBeHidden();
  await expect(compactIdentity).toBeVisible();
  await expect
    .poll(
      async () =>
        (await compactIdentity.locator("img").boundingBox())?.width ?? 0,
    )
    .toBeGreaterThanOrEqual(32);
});
