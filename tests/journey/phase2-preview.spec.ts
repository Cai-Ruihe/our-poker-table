import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }, testInfo) => {
  if (!testInfo.project.name.startsWith("phase-release")) return;
  // Packaged-path checks use deterministic local transport. The real origin
  // and owner-only relay credential are checked separately before publication.
  await context.route("**/poker-config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.__HTML_POKER_CONFIG__ = {};",
    }),
  );
});

test("Phase 2 preview defaults to digital and keeps both phase tables recoverable", async ({
  context,
  page: phase1,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires the assembled Phase 1 and Phase 2 release paths.",
  );

  await phase1.goto("/table-side/", { waitUntil: "commit" });
  await expect(
    phase1.locator('[data-qa-control="home-chip-mode-digital"]'),
  ).toHaveCount(0);
  await phase1.getByRole("button", { name: "Create table" }).click();
  await expect(
    phase1.getByRole("heading", { name: "Waiting for players" }),
  ).toBeVisible();
  const phase1RecoveryUrl = phase1.url();
  const phase1Invitation = await phase1
    .getByLabel("Player invitation link")
    .inputValue();

  const phase2 = await context.newPage();
  await phase2.goto("/multiplayer/", { waitUntil: "commit" });
  await expect(
    phase2.locator('[data-qa-control="home-chip-mode-digital"]'),
  ).toBeChecked();
  await expect(
    phase2.getByText(
      "Phase 2 test preview: one hand per table. Create a new table for the next hand.",
    ),
  ).toBeVisible();

  await phase2.getByLabel("Invitation URL").fill(phase1Invitation);
  await phase2.getByRole("button", { name: "Open invitation" }).click();
  await expect(phase2.getByRole("alert")).toContainText("another version");
  await expect(
    phase2.locator('[data-qa-control="home-create-table"]'),
  ).toBeVisible();
  expect(new URL(phase2.url()).hash).toBe("");

  await phase2.getByRole("button", { name: "Create table" }).click();
  await expect(
    phase2.getByRole("heading", { name: "Waiting for players" }),
  ).toBeVisible();
  const phase2RecoveryUrl = phase2.url();
  expect(new URL(phase1RecoveryUrl).pathname).toBe("/table-side/");
  expect(new URL(phase2RecoveryUrl).pathname).toBe("/multiplayer/");

  await phase1.reload();
  await expect(
    phase1.getByRole("heading", { name: "Waiting for players" }),
  ).toBeVisible();
  await phase2.reload();
  await expect(
    phase2.getByRole("heading", { name: "Waiting for players" }),
  ).toBeVisible();
});

test("Phase 2 packaged clients play a digital hand through confirmed settlement", async ({
  context,
  page: host,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires the assembled release paths.",
  );
  await host.goto("/multiplayer/");
  await host.getByRole("button", { name: "Create table" }).click();
  const players = [];
  for (const name of ["Alice", "Bob"]) {
    const invitation = await host
      .getByLabel("Player invitation link")
      .inputValue();
    const player = await context.newPage();
    await player.goto(invitation);
    await player.getByLabel("Display name").fill(name);
    await player.getByRole("button", { name: "Join table" }).click();
    await expect(
      player.getByRole("heading", { name: "You have a seat" }),
    ).toBeVisible();
    players.push(player);
  }
  const [alice, bob] = players;
  if (!alice || !bob) throw new Error("Two player fixtures required");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  const control = (page: typeof host, name: string) =>
    page.locator(`[data-qa-control="${name}"]`);
  await control(alice, "player-bet-call").click();
  await control(bob, "player-bet-check").click();
  await expect(host.locator("[data-board-card]")).toHaveCount(3);
  await control(bob, "player-bet-commit").click();
  await control(alice, "player-bet-commit").click();
  await control(bob, "player-bet-all-in").click();
  await control(alice, "player-bet-fold").click();
  await control(host, "dealer-review-settlement").click();
  await expect(
    host.getByText("Settlement review", { exact: true }).first(),
  ).toBeVisible();
  await control(host, "dealer-confirm-settlement").click();
  await expect(
    host.getByText("Hand complete", { exact: true }).first(),
  ).toBeVisible();
  await host.reload();
  await expect(
    host.getByText("Hand complete", { exact: true }).first(),
  ).toBeVisible();
});
