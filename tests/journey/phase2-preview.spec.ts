import { expect, test } from "@playwright/test";
import { exerciseControl } from "./control-qa";

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
      "Phase 2 test preview: confirm settlement before the next hand. Top up between hands; new seats after dealing are not supported.",
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

test("Phase 2 feedback: visible stacks, acting seat, settlement, top-up and next hand", async ({
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
  const staleInvitation = await host
    .getByLabel("Player invitation link")
    .inputValue();
  const recoveryUrl = host.url();
  const tableId = new URL(recoveryUrl).hash.match(
    /(?:^#|&)table=([^&]+)/u,
  )?.[1];
  if (!tableId) throw new Error("Missing synthetic test table identity");
  const hostDatabase = `phase2:html-poker-host:${decodeURIComponent(tableId)}`;
  // Preserve the encrypted pre-deal runtime record to reproduce a crash between
  // the authority hand commit and runtime join-window commit. Never extract keys.
  await alice.evaluate(async (databaseName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      const records = tx.objectStore("records");
      const request = records.get("runtime");
      request.onsuccess = () =>
        records.put({ ...request.result, recordKey: "qa-stale-runtime" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, hostDatabase);
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await expect(alice.locator("[data-private-card]")).toHaveCount(2);
  await host.goto("about:blank");
  await alice.evaluate(async (databaseName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      const records = tx.objectStore("records");
      const request = records.get("qa-stale-runtime");
      request.onsuccess = () => {
        records.put({ ...request.result, recordKey: "runtime" });
        records.delete("qa-stale-runtime");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, hostDatabase);
  // Hold the durable authority read while a real old invitation arrives. The
  // host must queue it until recovery finishes, never redeem into stale identity.
  await host.addInitScript(() => {
    if (sessionStorage.getItem("qa-recovery-probe-done")) return;
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    let paused = false;
    crypto.subtle.decrypt = async (algorithm, key, data) => {
      const aad =
        typeof algorithm === "object" && "additionalData" in algorithm
          ? new TextDecoder().decode(algorithm.additionalData as BufferSource)
          : "";
      if (aad.startsWith("authority\u0000")) {
        paused = true;
        document.documentElement.dataset.qaRecoveryPaused = "true";
        await new Promise<void>((resolve) => {
          window.addEventListener("qa-release-recovery", () => resolve(), {
            once: true,
          });
        });
        paused = false;
        sessionStorage.setItem("qa-recovery-probe-done", "true");
      } else if (paused && aad.startsWith("join:")) {
        document.documentElement.dataset.qaPrematureJoin = "true";
      }
      return decrypt(algorithm, key, data);
    };
    const OriginalChannel = BroadcastChannel;
    window.BroadcastChannel = class extends OriginalChannel {
      constructor(name: string) {
        super(name);
        this.addEventListener("message", (event) => {
          if (event.data?.message?.kind === "join-request") {
            document.documentElement.dataset.qaJoinReceived = "true";
          }
        });
      }
    };
  });
  await host.goto(recoveryUrl);
  await expect(host.locator("html")).toHaveAttribute(
    "data-qa-recovery-paused",
    "true",
  );
  const latePlayer = await context.newPage();
  await latePlayer.goto(staleInvitation);
  await latePlayer.getByLabel("Display name").fill("Late arrival");
  await latePlayer.getByRole("button", { name: "Join table" }).click();
  await expect(host.locator("html")).toHaveAttribute(
    "data-qa-join-received",
    "true",
  );
  // Allow the received message's asynchronous decrypt/mutation path to execute
  // while authority remains deliberately suspended (a bounded race injection).
  await host.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  await expect(host.locator("html")).not.toHaveAttribute(
    "data-qa-premature-join",
    "true",
  );
  await host.evaluate(() =>
    window.dispatchEvent(new Event("qa-release-recovery")),
  );
  await latePlayer.close();
  const control = (page: typeof host, name: string) =>
    page.locator(`[data-qa-control="${name}"]`);
  await expect(host.locator("[data-seat-stack]")).toHaveCount(2);
  await control(host, "host-root-controls-open").click();
  await control(host, "host-root-manage-players").click();
  await expect(
    host.getByText("New players locked", { exact: true }),
  ).toBeVisible();
  await expect(control(host, "host-open-join-window")).toHaveCount(0);
  await expect(host.getByLabel("Player invitation link")).toHaveCount(0);
  await expect(control(host, "host-top-up-amount")).toBeDisabled();
  await control(host, "administration-close").click();
  await expect(
    alice.locator("[data-player-stack-list] [data-seat-stack]"),
  ).toHaveCount(2);
  await expect(host.locator('[data-seat-acting="true"]')).toContainText(
    "Alice",
  );
  await expect(control(alice, "player-leave-waiting")).toHaveCount(0);
  await control(host, "device-view-tablet").click();
  await expect(host.locator("[data-table-pot]")).toBeVisible();
  await control(host, "tablet-corner-open").last().click();
  await expect(control(host, "tablet-next-card")).toHaveCount(0);
  await expect(control(host, "tablet-next-hand")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await control(host, "tablet-quick-close").click();
  await control(alice, "player-bet-call").click();
  await expect(host.locator('[data-seat-acting="true"]')).toHaveAttribute(
    "aria-label",
    /Bob/,
  );
  await control(bob, "player-bet-check").click();
  await expect(host.locator("[data-board-card]")).toHaveCount(3);
  const boardBox = await host.locator(".dealer-rail__cards").boundingBox();
  const potBox = await host.locator("[data-table-pot]").boundingBox();
  if (!boardBox || !potBox) throw new Error("Board and pot must be measurable");
  expect(potBox.y).toBeGreaterThanOrEqual(boardBox.y + boardBox.height);
  expect(potBox.y - boardBox.y - boardBox.height).toBeLessThan(40);
  expect(
    Math.abs(potBox.x + potBox.width / 2 - boardBox.x - boardBox.width / 2),
  ).toBeLessThan(4);
  await host.screenshot({
    path: testInfo.outputPath("feedback-pot-and-actor.png"),
  });
  await alice.locator("[data-player-stack-list]").scrollIntoViewIfNeeded();
  await alice.screenshot({
    path: testInfo.outputPath("feedback-player-stacks.png"),
  });
  await control(bob, "player-bet-commit").click();
  await control(alice, "player-bet-commit").click();
  await control(bob, "player-bet-all-in").click();
  await control(alice, "player-bet-fold").click();
  await control(host, "tablet-corner-open").last().click();
  await exerciseControl(
    "tablet-review-settlement",
    control(host, "tablet-review-settlement"),
    (target) => target.click(),
    () =>
      expect(
        host.getByText("Settlement proposal", { exact: true }).first(),
      ).toBeVisible(),
  );
  await expect(
    host.getByText("Settlement proposal", { exact: true }).first(),
  ).toBeVisible();
  // Accepted actions close the panel after the committed projection arrives.
  await expect(host.locator(".tablet-quick-panel")).toBeHidden();
  await control(host, "tablet-corner-open").last().click();
  await exerciseControl(
    "tablet-confirm-settlement",
    control(host, "tablet-confirm-settlement"),
    (target) => target.click(),
    () =>
      expect(
        host.getByText("Settlement result", { exact: true }).first(),
      ).toBeVisible(),
  );
  await expect(
    host.getByText("Settlement result", { exact: true }).first(),
  ).toBeVisible();
  await expect(host.locator(".tablet-quick-panel")).toBeHidden();
  await control(host, "tablet-corner-open").last().click();
  await control(host, "tablet-quick-more").click();
  await control(host, "tablet-manage-players").click();
  await exerciseControl(
    "host-top-up-seat",
    control(host, "host-top-up-seat"),
    (target) => target.selectOption({ label: "Alice" }),
    () =>
      expect(
        control(host, "host-top-up-seat").locator("option:checked"),
      ).toHaveText("Alice"),
  );
  await control(host, "host-top-up-amount").fill("50");
  await control(host, "host-top-up-submit").click();
  await expect(control(host, "host-top-up-submit")).toHaveText(
    "Confirm top-up",
  );
  await exerciseControl(
    "host-top-up-submit",
    control(host, "host-top-up-submit"),
    (target) => target.click(),
    () => expect(host.getByText("Added 50 chips to Alice.")).toBeVisible(),
  );
  const stacks = await host
    .locator("[data-seat-stack]")
    .evaluateAll((seats) =>
      seats.map((seat) => seat.getAttribute("data-seat-stack")),
    );
  await expect
    .poll(() =>
      alice
        .locator("[data-player-stack-list] [data-seat-stack]")
        .evaluateAll((seats) =>
          seats.map((seat) => seat.getAttribute("data-seat-stack")),
        ),
    )
    .toEqual(stacks);
  await control(host, "administration-close").click();
  await host.screenshot({
    path: testInfo.outputPath("feedback-top-up-complete.png"),
  });
  await host.reload();
  await expect
    .poll(() =>
      host
        .locator("[data-seat-stack]")
        .evaluateAll((seats) =>
          seats.map((seat) => seat.getAttribute("data-seat-stack")),
        ),
    )
    .toEqual(stacks);
  await control(host, "device-view-tablet").click();
  await control(host, "tablet-corner-open").last().click();
  await expect(control(host, "tablet-next-hand")).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await control(host, "tablet-next-hand").press("End");
  await expect(host.locator("[data-board-card]")).toHaveCount(0);
  await expect(host.locator('[data-seat-acting="true"]')).toHaveAttribute(
    "aria-label",
    /Bob/,
  );
  await expect(control(bob, "player-bet-call")).toBeEnabled();
  await expect(host.getByRole("alert")).toHaveCount(0);
  await host.screenshot({
    path: testInfo.outputPath("feedback-next-hand.png"),
  });
});
