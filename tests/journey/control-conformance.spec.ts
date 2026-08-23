import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { exerciseControl, exerciseControlVariant } from "./control-qa";

const airplaneUrl = pathToFileURL(
  path.join(process.cwd(), "dist", "airplane", "poker-airplane.html"),
).toString();

function control(page: Page | Locator, id: string): Locator {
  return page.locator(`[data-qa-control="${id}"]`);
}

function controlVariant(
  page: Page | Locator,
  id: string,
  variant: string,
): Locator {
  return page.locator(
    `[data-qa-control="${id}"][data-qa-variant="${variant}"]`,
  );
}

async function installClipboard(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          Reflect.set(globalThis, "__htmlPokerCopiedText", value);
        },
      },
    });
  });
}

async function createHost(host: Page): Promise<void> {
  await host.goto("/");
  await host.getByRole("button", { name: "Create table" }).click();
  await expect(
    host.getByRole("heading", { name: "Waiting for players" }),
  ).toBeVisible();
}

async function joinPlayer(
  host: Page,
  context: BrowserContext,
  displayName: string,
  recordControl = false,
): Promise<Page> {
  const invitation = await host
    .getByLabel("Player invitation link")
    .inputValue();
  const player = await context.newPage();
  await player.goto(invitation);
  await player.getByLabel("Display name").fill(displayName);
  const join = control(player, "player-join-table");
  if (recordControl) {
    await exerciseControl(
      "player-join-table",
      join,
      (target) => target.click(),
      () =>
        expect(
          player.getByRole("heading", { name: "You have a seat" }),
        ).toBeVisible(),
    );
  } else {
    await join.click();
  }
  await expect(
    host
      .locator('[data-qa-control="roster-map-seat"]')
      .filter({ hasText: displayName }),
  ).toBeVisible();
  return player;
}

async function createPhysicalTable(
  host: Page,
  context: BrowserContext,
): Promise<{ alice: Page; bob: Page }> {
  await createHost(host);
  const alice = await joinPlayer(host, context, "Alice", true);
  const bob = await joinPlayer(host, context, "Bob");
  await joinPlayer(host, context, "Charlie");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await expect(
    host.getByText("Pre-flop", { exact: true }).first(),
  ).toBeVisible();
  return { alice, bob };
}

async function openSecondary(host: Page): Promise<Locator> {
  await controlVariant(host, "tablet-corner-open", "lower-right").click();
  await control(host, "tablet-quick-more").click();
  const secondary = host.locator(".secondary-controls");
  await expect(secondary).toBeVisible();
  return secondary;
}

async function dragSliderToConfirm(host: Page, slider: Locator): Promise<void> {
  const track = await slider.boundingBox();
  if (!track) throw new Error("The next-hand slider is not measurable.");
  await host.mouse.move(track.x + 32, track.y + track.height / 2);
  await host.mouse.down();
  await host.mouse.move(track.x + 124, track.y + track.height / 2, {
    steps: 8,
  });
  await host.mouse.up();
}

test("Home buttons, selectors, pasted invitations, and QR fallback have verified outcomes", async ({
  context,
  page: host,
}) => {
  await host.goto("/?experimental=digital-chips");
  await control(host, "home-chip-mode-digital").check();
  await exerciseControl(
    "home-chip-mode-physical",
    control(host, "home-chip-mode-physical"),
    (target) => target.check(),
    () => expect(host.getByLabel("Physical chips")).toBeChecked(),
  );
  await exerciseControl(
    "home-chip-mode-digital",
    control(host, "home-chip-mode-digital"),
    (target) => target.check(),
    () => expect(host.getByLabel("Starting stack")).toBeVisible(),
  );

  await exerciseControl(
    "home-scan-invitation",
    control(host, "home-scan-invitation"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", { name: "Scan player invitation QR" }),
      ).toBeVisible(),
  );
  const scanner = host.getByRole("dialog", {
    name: "Scan player invitation QR",
  });
  await exerciseControl(
    "qr-camera-file",
    control(scanner, "qr-camera-file"),
    (target) =>
      target.setInputFiles({
        buffer: Buffer.from("not-a-qr"),
        mimeType: "image/png",
        name: "not-a-qr.png",
      }),
    () => expect(scanner.getByRole("alert")).toBeVisible(),
  );
  await exerciseControl(
    "qr-camera-close",
    control(scanner, "qr-camera-close"),
    (target) => target.click(),
    () => expect(scanner).toHaveCount(0),
  );

  await exerciseControl(
    "home-create-table",
    control(host, "home-create-table"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("heading", { name: "Waiting for players" }),
      ).toBeVisible(),
  );
  const invitation = await host
    .getByLabel("Player invitation link")
    .inputValue();
  const joiner = await context.newPage();
  await joiner.goto("/");
  await joiner.getByLabel("Invitation URL").fill(invitation);
  await exerciseControl(
    "home-open-invitation",
    control(joiner, "home-open-invitation"),
    (target) => target.click(),
    () =>
      expect(
        joiner.getByRole("heading", { name: "Join this table" }),
      ).toBeVisible(),
  );
});

test("Host lobby, roster, invitations, diagnostics, and corrections verify their results", async ({
  context,
  page: host,
}) => {
  await installClipboard(context);
  await createHost(host);
  const originalPlayerLink = await host
    .getByLabel("Player invitation link")
    .inputValue();

  await exerciseControl(
    "player-invitation-copy",
    control(host, "player-invitation-copy"),
    (target) => target.click(),
    () =>
      expect
        .poll(() =>
          host.evaluate(() => Reflect.get(globalThis, "__htmlPokerCopiedText")),
        )
        .toBe(originalPlayerLink),
  );
  await exerciseControl(
    "player-invitation-refresh",
    control(host, "player-invitation-refresh"),
    (target) => target.click(),
    () =>
      expect
        .poll(() => host.getByLabel("Player invitation link").inputValue())
        .not.toBe(originalPlayerLink),
  );

  await exerciseControlVariant(
    "role-invitation-create",
    "public-table",
    controlVariant(host, "role-invitation-create", "public-table"),
    (target) => target.click(),
    () => expect(host.getByLabel("Public Table invitation link")).toBeVisible(),
  );
  const publicCard = host
    .getByLabel("Public Table invitation link")
    .locator("xpath=ancestor::article");
  const publicLink = await host
    .getByLabel("Public Table invitation link")
    .inputValue();
  await exerciseControlVariant(
    "role-invitation-copy",
    "public-table",
    controlVariant(publicCard, "role-invitation-copy", "public-table"),
    (target) => target.click(),
    () =>
      expect
        .poll(() =>
          host.evaluate(() => Reflect.get(globalThis, "__htmlPokerCopiedText")),
        )
        .toBe(publicLink),
  );
  await exerciseControlVariant(
    "role-invitation-replace",
    "public-table",
    controlVariant(publicCard, "role-invitation-replace", "public-table"),
    (target) => target.click(),
    () =>
      expect
        .poll(() =>
          host.getByLabel("Public Table invitation link").inputValue(),
        )
        .not.toBe(publicLink),
  );

  await exerciseControlVariant(
    "role-invitation-create",
    "tv",
    controlVariant(host, "role-invitation-create", "tv"),
    (target) => target.click(),
    () => expect(host.getByLabel("TV invitation link")).toBeVisible(),
  );
  const tvCard = host
    .getByLabel("TV invitation link")
    .locator("xpath=ancestor::article");
  const tvLink = await host.getByLabel("TV invitation link").inputValue();
  await exerciseControlVariant(
    "role-invitation-copy",
    "tv",
    controlVariant(tvCard, "role-invitation-copy", "tv"),
    (target) => target.click(),
    () =>
      expect
        .poll(() =>
          host.evaluate(() => Reflect.get(globalThis, "__htmlPokerCopiedText")),
        )
        .toBe(tvLink),
  );
  await exerciseControlVariant(
    "role-invitation-replace",
    "tv",
    controlVariant(tvCard, "role-invitation-replace", "tv"),
    (target) => target.click(),
    () =>
      expect
        .poll(() => host.getByLabel("TV invitation link").inputValue())
        .not.toBe(tvLink),
  );

  await exerciseControlVariant(
    "role-invitation-create",
    "table-control",
    controlVariant(host, "role-invitation-create", "table-control"),
    (target) => target.click(),
    () =>
      expect(host.getByLabel("Tablet Control invitation link")).toBeVisible(),
  );
  const tabletCard = host
    .getByLabel("Tablet Control invitation link")
    .locator("xpath=ancestor::article");
  const initialTabletLink = await host
    .getByLabel("Tablet Control invitation link")
    .inputValue();
  await exerciseControlVariant(
    "role-invitation-copy",
    "table-control",
    controlVariant(tabletCard, "role-invitation-copy", "table-control"),
    (target) => target.click(),
    () =>
      expect
        .poll(() =>
          host.evaluate(() => Reflect.get(globalThis, "__htmlPokerCopiedText")),
        )
        .toBe(initialTabletLink),
  );
  await exerciseControlVariant(
    "role-invitation-replace",
    "table-control",
    controlVariant(tabletCard, "role-invitation-replace", "table-control"),
    (target) => target.click(),
    () =>
      expect
        .poll(() =>
          host.getByLabel("Tablet Control invitation link").inputValue(),
        )
        .not.toBe(initialTabletLink),
  );
  const tabletLink = await host
    .getByLabel("Tablet Control invitation link")
    .inputValue();
  const tablet = await context.newPage();
  await tablet.goto(tabletLink);
  await expect(
    tablet.getByRole("heading", { name: "Connecting to the table" }),
  ).toBeVisible();

  await exerciseControl(
    "roster-join-window-toggle",
    control(host, "roster-join-window-toggle"),
    (target) => target.click(),
    () => expect(host.getByText("New players locked")).toBeVisible(),
  );
  await exerciseControl(
    "host-open-join-window",
    control(host, "host-open-join-window"),
    (target) => target.click(),
    () => expect(host.getByLabel("Player invitation link")).toBeVisible(),
  );

  await host.getByLabel("My display name").fill("Host player");
  await exerciseControl(
    "host-join-own-device",
    control(host, "host-join-own-device"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("heading", { name: "You have a seat" }),
      ).toBeVisible(),
  );
  await exerciseControl(
    "device-view-host",
    control(host, "device-view-host"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("heading", { name: "Waiting for players" }),
      ).toBeVisible(),
  );
  await joinPlayer(host, context, "Bob");
  await exerciseControl(
    "host-deal-first-hand",
    control(host, "host-deal-first-hand"),
    (target) => target.click(),
    () =>
      expect(host.getByText("Pre-flop", { exact: true }).first()).toBeVisible(),
  );
  await expect(tablet.locator("[data-table-corner]")).toHaveCount(4);
  await exerciseControl(
    "device-view-player",
    control(host, "device-view-player"),
    (target) => target.click(),
    () =>
      expect(host.getByRole("region", { name: "Your cards" })).toBeVisible(),
  );
  await exerciseControl(
    "device-view-host",
    control(host, "device-view-host"),
    (target) => target.click(),
    () => expect(host.getByLabel("Dealer controls")).toBeVisible(),
  );
  await exerciseControl(
    "device-view-tablet",
    control(host, "device-view-tablet"),
    (target) => target.click(),
    () => expect(host.locator("[data-table-corner]")).toHaveCount(4),
  );
  const tabletSecondary = await openSecondary(host);
  await control(tabletSecondary, "tablet-view-host").click();

  await exerciseControl(
    "host-manage-players",
    control(host, "host-manage-players"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("complementary", { name: "Player administration" }),
      ).toBeVisible(),
  );
  const administration = host.getByRole("complementary", {
    name: "Player administration",
  });
  await exerciseControlVariant(
    "host-theme-choice",
    "dark-green",
    controlVariant(administration, "host-theme-choice", "dark-green"),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-theme",
        "dark-green",
      ),
  );
  await exerciseControlVariant(
    "host-theme-choice",
    "black-gold",
    controlVariant(administration, "host-theme-choice", "black-gold"),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-theme",
        "black-gold",
      ),
  );
  await exerciseControlVariant(
    "host-theme-choice",
    "deep-navy",
    controlVariant(administration, "host-theme-choice", "deep-navy"),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-theme",
        "deep-navy",
      ),
  );

  const bobMapSeat = administration.getByRole("button", {
    name: /^Seat 2, Bob,/u,
  });
  const bobSeatId = await bobMapSeat.getAttribute("data-qa-variant");
  if (!bobSeatId) throw new Error("Bob's spatial seat identity is missing.");
  await exerciseControl(
    "roster-map-seat",
    bobMapSeat,
    (target) => target.click(),
    () => expect(administration.getByLabel("Manage Bob")).toBeVisible(),
  );
  await exerciseControl(
    "roster-seat-move-up",
    controlVariant(administration, "roster-seat-move-up", bobSeatId),
    (target) => target.click(),
    () =>
      expect(administration.locator(".roster li strong").first()).toHaveText(
        "Bob",
      ),
  );
  await exerciseControl(
    "roster-seat-move-down",
    controlVariant(administration, "roster-seat-move-down", bobSeatId),
    (target) => target.click(),
    () =>
      expect(administration.locator(".roster li strong").last()).toHaveText(
        "Bob",
      ),
  );
  await exerciseControl(
    "roster-replace-device",
    controlVariant(administration, "roster-replace-device", bobSeatId),
    (target) => target.click(),
    () => expect(host.getByLabel("Player replacement link")).toBeVisible(),
  );

  await exerciseControl(
    "administration-close",
    control(administration, "administration-close"),
    (target) => target.click(),
    () => expect(administration).toHaveCount(0),
  );
  await exerciseControl(
    "host-developer-toggle",
    control(host, "host-developer-toggle"),
    (target) => target.click(),
    () => expect(host.getByLabel("Developer diagnostics")).toBeVisible(),
  );
  const downloadPromise = host.waitForEvent("download");
  await exerciseControl(
    "developer-save-log",
    control(host, "developer-save-log"),
    (target) => target.click(),
    async () => {
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain("diagnostics.json");
    },
  );

  await control(host, "host-manage-players").click();
  await host.getByLabel("Reason to void the active hand").fill("Control audit");
  await exerciseControl(
    "history-void-hand",
    control(administration, "history-void-hand"),
    (target) => target.click(),
    () =>
      expect(
        host.getByText("Hand complete", { exact: true }).first(),
      ).toBeVisible(),
  );
  const eventSelect = control(administration, "history-correction-event");
  const eventValue = await eventSelect
    .locator("option")
    .last()
    .getAttribute("value");
  if (!eventValue) throw new Error("History correction target is missing.");
  await exerciseControl(
    "history-correction-event",
    eventSelect,
    (target) => target.selectOption(eventValue),
    () => expect(eventSelect).toHaveValue(eventValue),
  );
  await host.getByLabel("Correction note").fill("Control result verified");
  await exerciseControl(
    "history-append-correction",
    control(administration, "history-append-correction"),
    (target) => target.click(),
    () => expect(eventSelect).toContainText("CorrectionRecorded"),
  );
  // A dealer is selected between hands; the marker is only visible once that
  // seat participates in the next hand.
  await administration
    .locator('[data-qa-control="roster-map-seat"]')
    .filter({ hasText: "Bob" })
    .click();
  await exerciseControl(
    "roster-make-dealer",
    controlVariant(administration, "roster-make-dealer", bobSeatId),
    (target) => target.click(),
    () =>
      expect(
        host.getByText("Hand complete", { exact: true }).first(),
      ).toBeVisible(),
  );
  await host
    .getByRole("button", { name: "Close player administration" })
    .click();
  await host.getByRole("button", { name: "Deal next hand" }).click();
  await expect(
    host.getByText("Pre-flop", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    host.locator(".seat-tile").filter({ hasText: "Bob" }).getByLabel("Dealer"),
  ).toBeVisible();
  await control(host, "host-manage-players").click();
  await expect(administration).toBeVisible();
  const tabletCapability = administration
    .locator(".capability-list li")
    .filter({ hasText: "table control" });
  await exerciseControl(
    "capability-revoke",
    control(tabletCapability, "capability-revoke"),
    (target) => target.click(),
    () =>
      expect(
        tablet.getByRole("heading", {
          name: "This room surface could not be opened",
        }),
      ).toBeVisible(),
  );
  await exerciseControl(
    "role-reconnect-error",
    control(tablet, "role-reconnect-error"),
    (target) => target.click(),
    () => expect(tablet.getByText(/credential-revoked/u)).toBeVisible(),
  );
});

test("Physical-player and dealer controls commit the advertised state transitions", async ({
  context,
  page: host,
}) => {
  const { alice, bob } = await createPhysicalTable(host, context);

  await exerciseControl(
    "player-reveal-private",
    control(alice, "player-reveal-private"),
    (target) => target.click(),
    () => expect(control(alice, "player-hide-private")).toBeVisible(),
  );
  await exerciseControl(
    "player-hide-private",
    control(alice, "player-hide-private"),
    (target) => target.click(),
    () => expect(control(alice, "player-reveal-private")).toBeVisible(),
  );
  await exerciseControl(
    "table-reconnect",
    control(alice, "table-reconnect"),
    (target) => target.click(),
    () =>
      expect(alice.getByRole("region", { name: "Your cards" })).toBeVisible(),
  );
  await exerciseControl(
    "player-sit-out-toggle",
    control(alice, "player-sit-out-toggle"),
    (target) => target.click(),
    () => expect(control(alice, "player-sit-out-toggle")).toBeChecked(),
  );
  await exerciseControl(
    "player-leave-active",
    control(alice, "player-leave-active"),
    (target) => target.click(),
    () =>
      expect(
        alice.getByRole("dialog", { name: "Leave this table?" }),
      ).toBeVisible(),
  );
  await exerciseControl(
    "leave-dialog-cancel",
    control(alice, "leave-dialog-cancel"),
    (target) => target.click(),
    () =>
      expect(
        alice.getByRole("dialog", { name: "Leave this table?" }),
      ).toHaveCount(0),
  );
  await exerciseControl(
    "player-show-cards",
    control(alice, "player-show-cards"),
    (target) => target.click(),
    () => expect(host.locator("[data-shown-card]")).toHaveCount(2),
  );
  await exerciseControl(
    "player-fold",
    control(bob, "player-fold"),
    (target) => target.click(),
    () => expect(control(bob, "player-undo-fold")).toBeVisible(),
  );
  await exerciseControl(
    "player-undo-fold",
    control(bob, "player-undo-fold"),
    (target) => target.click(),
    () => expect(control(bob, "player-fold")).toBeVisible(),
  );
  await control(bob, "player-fold").click();

  await exerciseControlVariant(
    "dealer-next-street",
    "preflop",
    controlVariant(host, "dealer-next-street", "preflop"),
    (target) => target.click(),
    () => expect(host.locator("[data-board-card]")).toHaveCount(3),
  );
  await exerciseControlVariant(
    "dealer-next-street",
    "flop",
    controlVariant(host, "dealer-next-street", "flop"),
    (target) => target.click(),
    () => expect(host.locator("[data-board-card]")).toHaveCount(4),
  );
  await exerciseControlVariant(
    "dealer-next-street",
    "turn",
    controlVariant(host, "dealer-next-street", "turn"),
    (target) => target.click(),
    () => expect(host.locator("[data-board-card]")).toHaveCount(5),
  );
  await exerciseControl(
    "dealer-open-end-hand",
    control(host, "dealer-open-end-hand"),
    (target) => target.click(),
    () => expect(host.getByText("Physical chips settled?")).toBeVisible(),
  );
  await exerciseControl(
    "dealer-cancel-end-hand",
    control(host, "dealer-cancel-end-hand"),
    (target) => target.click(),
    () => expect(host.getByText("Physical chips settled?")).toHaveCount(0),
  );
  await control(host, "dealer-open-end-hand").click();
  await exerciseControl(
    "dealer-confirm-end-hand",
    control(host, "dealer-confirm-end-hand"),
    (target) => target.click(),
    () =>
      expect(
        host.getByText("Hand complete", { exact: true }).first(),
      ).toBeVisible(),
  );
  await exerciseControl(
    "dealer-next-hand",
    control(host, "dealer-next-hand"),
    (target) => target.click(),
    () =>
      expect(host.getByText("Pre-flop", { exact: true }).first()).toBeVisible(),
  );

  await expect(alice.getByText("Sitting out", { exact: true })).toBeVisible();
  const navigationCount = await alice.evaluate(
    () => performance.getEntriesByType("navigation").length,
  );
  await exerciseControl(
    "player-refresh-waiting",
    control(alice, "player-refresh-waiting"),
    (target) => target.click(),
    async () => {
      expect(
        await alice.evaluate(
          () => performance.getEntriesByType("navigation").length,
        ),
      ).toBe(navigationCount);
      await expect(
        alice.getByText("Sitting out", { exact: true }),
      ).toBeVisible();
    },
  );
  await exerciseControl(
    "player-return-next-hand",
    control(alice, "player-return-next-hand"),
    (target) => target.click(),
    () =>
      expect(
        alice.getByText("Ready for next hand", { exact: true }),
      ).toBeVisible(),
  );
  await exerciseControl(
    "player-leave-waiting",
    control(alice, "player-leave-waiting"),
    (target) => target.click(),
    () =>
      expect(
        alice.getByRole("dialog", { name: "Leave this table?" }),
      ).toBeVisible(),
  );
  await exerciseControl(
    "leave-dialog-confirm",
    control(alice, "leave-dialog-confirm"),
    (target) => target.click(),
    () =>
      expect(
        alice.getByRole("heading", { name: "Join another session" }),
      ).toBeVisible(),
  );
});

test("Digital-chip action buttons cover call, check, bet, raise, all-in, fold, and settlement", async ({
  context,
  page: host,
}) => {
  await host.goto("/?experimental=digital-chips");
  await host.getByLabel("Digital chips").check();
  await host.getByRole("button", { name: "Create table" }).click();
  const alice = await joinPlayer(host, context, "Alice");
  const bob = await joinPlayer(host, context, "Bob");
  await host.getByRole("button", { name: "Deal first hand" }).click();

  await exerciseControl(
    "player-bet-call",
    control(alice, "player-bet-call"),
    (target) => target.click(),
    () => expect(control(bob, "player-bet-check")).toBeVisible(),
  );
  await exerciseControl(
    "player-bet-check",
    control(bob, "player-bet-check"),
    (target) => target.click(),
    () => expect(host.locator("[data-board-card]")).toHaveCount(3),
  );
  await exerciseControlVariant(
    "player-bet-commit",
    "bet-to",
    controlVariant(bob, "player-bet-commit", "bet-to"),
    (target) => target.click(),
    () =>
      expect(
        controlVariant(alice, "player-bet-commit", "raise-to"),
      ).toBeVisible(),
  );
  await exerciseControlVariant(
    "player-bet-commit",
    "raise-to",
    controlVariant(alice, "player-bet-commit", "raise-to"),
    (target) => target.click(),
    () => expect(control(bob, "player-bet-all-in")).toBeVisible(),
  );
  await exerciseControl(
    "player-bet-all-in",
    control(bob, "player-bet-all-in"),
    (target) => target.click(),
    () => expect(control(alice, "player-bet-fold")).toBeVisible(),
  );
  await exerciseControl(
    "player-bet-fold",
    control(alice, "player-bet-fold"),
    (target) => target.click(),
    () =>
      expect(host.getByText("Showdown", { exact: true }).first()).toBeVisible(),
  );
  await exerciseControl(
    "dealer-review-settlement",
    control(host, "dealer-review-settlement"),
    (target) => target.click(),
    () =>
      expect(
        host.getByText("Settlement review", { exact: true }).first(),
      ).toBeVisible(),
  );
  await exerciseControl(
    "dealer-confirm-settlement",
    control(host, "dealer-confirm-settlement"),
    (target) => target.click(),
    () =>
      expect(
        host.getByText("Hand complete", { exact: true }).first(),
      ).toBeVisible(),
  );
});

test("Tablet quick and secondary controls all produce their registered outcomes", async ({
  context,
  page: host,
}) => {
  await createHost(host);
  await host.getByLabel("My display name").fill("Host player");
  await host
    .getByRole("button", { name: "Join my own table on this device" })
    .click();
  await expect(
    host.getByRole("heading", { name: "You have a seat" }),
  ).toBeVisible();
  await control(host, "device-view-host").click();
  await expect(host.getByLabel("Player invitation link")).toBeVisible();
  await joinPlayer(host, context, "Bob");
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await control(host, "device-view-tablet").click();

  await exerciseControlVariant(
    "tablet-corner-open",
    "upper-left",
    controlVariant(host, "tablet-corner-open", "upper-left"),
    (target) => target.click(),
    () =>
      expect(host.locator("[data-control-facing]")).toHaveAttribute(
        "data-control-facing",
        "upper",
      ),
  );
  await control(host, "tablet-quick-close").click();
  await exerciseControlVariant(
    "tablet-corner-open",
    "upper-right",
    controlVariant(host, "tablet-corner-open", "upper-right"),
    (target) => target.click(),
    () =>
      expect(host.locator("[data-control-facing]")).toHaveAttribute(
        "data-control-facing",
        "upper",
      ),
  );
  await control(host, "tablet-quick-close").click();
  await exerciseControlVariant(
    "tablet-corner-open",
    "lower-left",
    controlVariant(host, "tablet-corner-open", "lower-left"),
    (target) => target.click(),
    () =>
      expect(host.locator("[data-control-facing]")).toHaveAttribute(
        "data-control-facing",
        "lower",
      ),
  );
  await control(host, "tablet-quick-close").click();
  await exerciseControlVariant(
    "tablet-corner-open",
    "lower-right",
    controlVariant(host, "tablet-corner-open", "lower-right"),
    (target) => target.click(),
    () => expect(host.locator("[data-control-facing]")).toBeVisible(),
  );
  await exerciseControl(
    "tablet-quick-close",
    control(host, "tablet-quick-close"),
    (target) => target.click(),
    () => expect(host.locator("[data-control-facing]")).toHaveCount(0),
  );
  await controlVariant(host, "tablet-corner-open", "lower-right").click();
  await exerciseControl(
    "tablet-next-card",
    control(host, "tablet-next-card"),
    (target) => target.click(),
    async () => {
      await expect(host.locator("[data-board-card]")).toHaveCount(3);
      await expect(host.locator("[data-control-facing]")).toHaveCount(0);
    },
  );
  await controlVariant(host, "tablet-corner-open", "lower-right").click();
  await exerciseControl(
    "tablet-quick-more",
    control(host, "tablet-quick-more"),
    (target) => target.click(),
    () => expect(host.locator(".secondary-controls")).toBeVisible(),
  );
  let secondary = host.locator(".secondary-controls");
  await exerciseControlVariant(
    "tablet-theme-choice",
    "dark-green",
    controlVariant(secondary, "tablet-theme-choice", "dark-green"),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-theme",
        "dark-green",
      ),
  );
  await exerciseControlVariant(
    "tablet-theme-choice",
    "black-gold",
    controlVariant(secondary, "tablet-theme-choice", "black-gold"),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-theme",
        "black-gold",
      ),
  );
  await exerciseControlVariant(
    "tablet-theme-choice",
    "deep-navy",
    controlVariant(secondary, "tablet-theme-choice", "deep-navy"),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-theme",
        "deep-navy",
      ),
  );
  await host.evaluate(() => {
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: async () => {
        document.documentElement.dataset.fullscreenRequested = "true";
      },
    });
  });
  await exerciseControl(
    "tablet-fullscreen",
    control(secondary, "tablet-fullscreen"),
    (target) => target.click(),
    () =>
      expect(host.locator("html")).toHaveAttribute(
        "data-fullscreen-requested",
        "true",
      ),
  );
  await exerciseControl(
    "table-reconnect",
    control(secondary, "table-reconnect"),
    (target) => target.click(),
    () => expect(secondary).toBeVisible(),
  );
  const diagnosticDownload = host.waitForEvent("download");
  await exerciseControl(
    "tablet-save-log",
    control(secondary, "tablet-save-log"),
    (target) => target.click(),
    async () => {
      const download = await diagnosticDownload;
      expect(download.suggestedFilename()).toContain("diagnostics.json");
    },
  );
  await exerciseControl(
    "tablet-secondary-return",
    control(secondary, "tablet-secondary-return"),
    (target) => target.click(),
    () => expect(secondary).toHaveCount(0),
  );

  secondary = await openSecondary(host);
  await exerciseControl(
    "tablet-secondary-close",
    control(secondary, "tablet-secondary-close"),
    (target) => target.click(),
    () => expect(secondary).toHaveCount(0),
  );
  secondary = await openSecondary(host);
  await exerciseControl(
    "tablet-manage-players",
    control(secondary, "tablet-manage-players"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("complementary", { name: "Player administration" }),
      ).toHaveAttribute("data-admin-focus", "players"),
  );
  await control(host, "administration-close").click();
  await control(host, "device-view-tablet").click();
  secondary = await openSecondary(host);
  await exerciseControl(
    "tablet-manage-displays",
    control(secondary, "tablet-manage-displays"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("complementary", { name: "Player administration" }),
      ).toHaveAttribute("data-admin-focus", "displays"),
  );
  await control(host, "administration-close").click();
  await control(host, "device-view-tablet").click();
  secondary = await openSecondary(host);
  await exerciseControl(
    "tablet-view-player",
    control(secondary, "tablet-view-player"),
    (target) => target.click(),
    () =>
      expect(host.getByRole("region", { name: "Your cards" })).toBeVisible(),
  );
  await control(host, "device-view-tablet").click();
  secondary = await openSecondary(host);
  await exerciseControl(
    "tablet-view-host",
    control(secondary, "tablet-view-host"),
    (target) => target.click(),
    () =>
      expect(control(host, "device-view-host")).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
  );

  await control(host, "device-view-tablet").click();
  await controlVariant(host, "tablet-corner-open", "lower-right").click();
  const slider = control(host, "tablet-next-hand");
  await slider.dblclick();
  await expect(host.locator("[data-control-facing]")).toHaveCount(1);
  await expect(slider).toHaveAttribute("aria-disabled", "false");
  await exerciseControl(
    "tablet-next-hand",
    slider,
    (target) => dragSliderToConfirm(host, target),
    async () => {
      await expect(host.locator("[data-control-facing]")).toHaveCount(0);
      await expect(host.locator("[data-board-card]")).toHaveCount(0);
      await controlVariant(host, "tablet-corner-open", "lower-right").click();
      await expect(control(host, "tablet-next-card")).toBeEnabled();
      await expect(control(host, "tablet-next-card")).toContainText(
        "Deal the flop",
      );
    },
  );
});

test("A Trusted Host can reuse this device as TV or Tablet Control without a capability upgrade", async ({
  context,
  page: host,
}) => {
  await createPhysicalTable(host, context);

  await control(host, "host-manage-players").click();
  const administration = host.getByRole("complementary", {
    name: "Player administration",
  });
  await expect(administration).toBeVisible();

  await exerciseControlVariant(
    "role-invitation-use-this-device",
    "tv",
    controlVariant(administration, "role-invitation-use-this-device", "tv"),
    (target) => target.click(),
    async () => {
      await expect(host.locator(".table-surface--tv")).toBeVisible();
      await expect(control(host, "host-tv-return")).toBeVisible();
      await expect(control(host, "tablet-corner-open")).toHaveCount(0);
      await expect(host.getByLabel("TV invitation link")).toHaveCount(0);
    },
  );
  await exerciseControl(
    "host-tv-return",
    control(host, "host-tv-return"),
    (target) => target.click(),
    () =>
      expect(control(host, "device-view-host")).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
  );

  await control(host, "host-manage-players").click();
  await exerciseControlVariant(
    "role-invitation-use-this-device",
    "table-control",
    controlVariant(
      administration,
      "role-invitation-use-this-device",
      "table-control",
    ),
    (target) => target.click(),
    async () => {
      await expect(host.locator(".table-surface--tablet")).toBeVisible();
      await expect(control(host, "tablet-corner-open")).toHaveCount(4);
      await expect(
        host.getByLabel("Tablet Control invitation link"),
      ).toHaveCount(0);
    },
  );
});

test("Host brand control center routes every existing host capability", async ({
  context,
  page: host,
}) => {
  await createHost(host);
  await host.getByLabel("My display name").fill("Host player");
  await host
    .getByRole("button", { name: "Join my own table on this device" })
    .click();
  await expect(
    host.getByRole("heading", { name: "You have a seat" }),
  ).toBeVisible();
  await control(host, "device-view-host").click();
  await expect(host.getByLabel("Player invitation link")).toBeVisible();
  await joinPlayer(host, context, "Bob");
  await host.getByRole("button", { name: "Deal first hand" }).click();

  const rootDialog = host.getByRole("dialog", {
    name: "Table control center",
  });
  await exerciseControl(
    "host-root-controls-open",
    control(host, "host-root-controls-open"),
    (target) => target.click(),
    () => expect(rootDialog).toBeVisible(),
  );
  await exerciseControl(
    "host-root-controls-close",
    control(rootDialog, "host-root-controls-close"),
    (target) => target.click(),
    () => expect(rootDialog).toHaveCount(0),
  );

  await control(host, "host-root-controls-open").click();
  await exerciseControl(
    "host-root-controls-return",
    control(rootDialog, "host-root-controls-return"),
    (target) => target.click(),
    () => expect(rootDialog).toHaveCount(0),
  );

  await control(host, "host-root-controls-open").click();
  await exerciseControlVariant(
    "host-root-theme-choice",
    "dark-green",
    controlVariant(rootDialog, "host-root-theme-choice", "dark-green"),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-theme",
        "dark-green",
      ),
  );
  await exerciseControlVariant(
    "host-root-theme-choice",
    "black-gold",
    controlVariant(rootDialog, "host-root-theme-choice", "black-gold"),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-theme",
        "black-gold",
      ),
  );
  await exerciseControlVariant(
    "host-root-theme-choice",
    "deep-navy",
    controlVariant(rootDialog, "host-root-theme-choice", "deep-navy"),
    (target) => target.click(),
    () =>
      expect(host.locator(".table-surface")).toHaveAttribute(
        "data-theme",
        "deep-navy",
      ),
  );
  await host.evaluate(() => {
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: async () => {
        document.documentElement.dataset.hostFullscreenRequested = "true";
      },
    });
  });
  await exerciseControl(
    "host-root-fullscreen",
    control(rootDialog, "host-root-fullscreen"),
    (target) => target.click(),
    () =>
      expect(host.locator("html")).toHaveAttribute(
        "data-host-fullscreen-requested",
        "true",
      ),
  );
  await exerciseControl(
    "host-root-toggle-developer",
    control(rootDialog, "host-root-toggle-developer"),
    (target) => target.click(),
    () => expect(host.getByLabel("Developer diagnostics")).toBeVisible(),
  );
  const diagnosticDownload = host.waitForEvent("download");
  await exerciseControl(
    "host-root-save-log",
    control(rootDialog, "host-root-save-log"),
    (target) => target.click(),
    async () => {
      const download = await diagnosticDownload;
      expect(download.suggestedFilename()).toContain("diagnostics.json");
    },
  );

  await exerciseControl(
    "host-root-manage-players",
    control(rootDialog, "host-root-manage-players"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("complementary", { name: "Player administration" }),
      ).toHaveAttribute("data-admin-focus", "players"),
  );
  await control(host, "administration-close").click();

  await control(host, "host-root-controls-open").click();
  await exerciseControl(
    "host-root-manage-displays",
    control(rootDialog, "host-root-manage-displays"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("complementary", { name: "Player administration" }),
      ).toHaveAttribute("data-admin-focus", "displays"),
  );
  await control(host, "administration-close").click();

  await control(host, "host-root-controls-open").click();
  await exerciseControl(
    "host-root-view-player",
    control(rootDialog, "host-root-view-player"),
    (target) => target.click(),
    () =>
      expect(host.getByRole("region", { name: "Your cards" })).toBeVisible(),
  );
  await control(host, "device-view-host").click();
  await control(host, "host-root-controls-open").click();
  await exerciseControl(
    "host-root-view-table",
    control(rootDialog, "host-root-view-table"),
    (target) => target.click(),
    () => expect(host.locator("[data-table-corner]")).toHaveCount(4),
  );
});

test("Airplane pairing controls and role variants open the correct local workflows", async ({
  context,
}, testInfo: TestInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "File-origin offer generation is Chromium automation evidence; Mobile WebKit camera and geometry remain covered by the existing cross-engine journeys and physical matrix.",
  );

  const player = await context.newPage();
  await player.goto(airplaneUrl);
  await exerciseControl(
    "home-join-airplane",
    control(player, "home-join-airplane"),
    (target) => target.click(),
    () => expect(control(player, "airplane-player-scan-offer")).toBeVisible(),
  );
  await exerciseControl(
    "airplane-player-scan-offer",
    control(player, "airplane-player-scan-offer"),
    (target) => target.click(),
    () =>
      expect(
        player.getByRole("dialog", { name: "Scan host offer QR" }),
      ).toBeVisible(),
  );
  await control(player, "qr-camera-close").click();
  await exerciseControl(
    "airplane-player-cancel",
    control(player, "airplane-player-cancel"),
    (target) => target.click(),
    () => expect(control(player, "home-join-airplane")).toBeVisible(),
  );

  const host = await context.newPage();
  await host.goto(airplaneUrl);
  await host.getByRole("button", { name: "Create table" }).click();

  await exerciseControlVariant(
    "airplane-offer-prepare",
    "player",
    controlVariant(host, "airplane-offer-prepare", "player"),
    (target) => target.click(),
    () =>
      expect(host.getByAltText("Player Airplane offer QR code")).toBeVisible(),
  );
  await exerciseControlVariant(
    "airplane-offer-enlarge",
    "player",
    controlVariant(host, "airplane-offer-enlarge", "player"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", { name: "Enlarged Player pairing QR" }),
      ).toBeVisible(),
  );
  await exerciseControl(
    "airplane-offer-enlarge-close",
    control(host, "airplane-offer-enlarge-close"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", { name: "Enlarged Player pairing QR" }),
      ).toHaveCount(0),
  );
  await exerciseControlVariant(
    "airplane-answer-scan",
    "player",
    controlVariant(host, "airplane-answer-scan", "player"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", { name: "Scan Player answer QR" }),
      ).toBeVisible(),
  );
  await control(host, "qr-camera-close").click();

  // Explicit variant receipts keep source additions from hiding inside loops.
  await exerciseControlVariant(
    "airplane-offer-prepare",
    "public-table",
    controlVariant(host, "airplane-offer-prepare", "public-table"),
    (target) => target.click(),
    () =>
      expect(
        host.getByAltText("Public Table Airplane offer QR code"),
      ).toBeVisible(),
  );
  await exerciseControlVariant(
    "airplane-offer-prepare",
    "tv",
    controlVariant(host, "airplane-offer-prepare", "tv"),
    (target) => target.click(),
    () => expect(host.getByAltText("TV Airplane offer QR code")).toBeVisible(),
  );
  await exerciseControlVariant(
    "airplane-offer-prepare",
    "table-control",
    controlVariant(host, "airplane-offer-prepare", "table-control"),
    (target) => target.click(),
    () =>
      expect(
        host.getByAltText("Tablet Control Airplane offer QR code"),
      ).toBeVisible(),
  );
  await exerciseControlVariant(
    "airplane-offer-enlarge",
    "public-table",
    controlVariant(host, "airplane-offer-enlarge", "public-table"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", {
          name: "Enlarged Public Table pairing QR",
        }),
      ).toBeVisible(),
  );
  await control(host, "airplane-offer-enlarge-close").click();
  await exerciseControlVariant(
    "airplane-answer-scan",
    "public-table",
    controlVariant(host, "airplane-answer-scan", "public-table"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", { name: "Scan Public Table answer QR" }),
      ).toBeVisible(),
  );
  await control(host, "qr-camera-close").click();

  await exerciseControlVariant(
    "airplane-offer-enlarge",
    "tv",
    controlVariant(host, "airplane-offer-enlarge", "tv"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", { name: "Enlarged TV pairing QR" }),
      ).toBeVisible(),
  );
  await control(host, "airplane-offer-enlarge-close").click();
  await exerciseControlVariant(
    "airplane-answer-scan",
    "tv",
    controlVariant(host, "airplane-answer-scan", "tv"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", { name: "Scan TV answer QR" }),
      ).toBeVisible(),
  );
  await control(host, "qr-camera-close").click();

  await exerciseControlVariant(
    "airplane-offer-enlarge",
    "table-control",
    controlVariant(host, "airplane-offer-enlarge", "table-control"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", {
          name: "Enlarged Tablet Control pairing QR",
        }),
      ).toBeVisible(),
  );
  await control(host, "airplane-offer-enlarge-close").click();
  await exerciseControlVariant(
    "airplane-answer-scan",
    "table-control",
    controlVariant(host, "airplane-answer-scan", "table-control"),
    (target) => target.click(),
    () =>
      expect(
        host.getByRole("dialog", { name: "Scan Tablet Control answer QR" }),
      ).toBeVisible(),
  );
  await control(host, "qr-camera-close").click();
});

test("Invalid saved host recovery can explicitly return Home", async ({
  page,
}) => {
  await page.goto("/#resume=host&table=missing-control-audit");
  await expect(
    page.getByRole("heading", { name: "This saved table cannot be opened" }),
  ).toBeVisible();
  await exerciseControl(
    "recovery-return-home",
    control(page, "recovery-return-home"),
    (target) => target.click(),
    () =>
      expect(
        page.getByRole("heading", { name: "Create a table" }),
      ).toBeVisible(),
  );
});
