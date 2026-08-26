import { expect, test } from "@playwright/test";

function capturePath(
  testInfo: { outputPath: (name: string) => string },
  name: string,
): string {
  const directory = process.env.HTML_POKER_CAPTURE_DIR;
  return directory ? `${directory}/${name}` : testInfo.outputPath(name);
}

test.describe("bilingual product presentation", () => {
  test("the host can choose Chinese before creating a table", async ({
    page,
  }, testInfo) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Create a table" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "中文" })).toBeVisible();
    const languageSwitch = page.locator("[data-language-switch]");
    const brandBar = page.locator(".brand-bar");
    const homeLayout = page.locator(".home-layout");
    const [languageBox, brandBox, layoutBox] = await Promise.all([
      languageSwitch.boundingBox(),
      brandBar.boundingBox(),
      homeLayout.boundingBox(),
    ]);
    expect(languageBox, "expected the visible language switch").not.toBeNull();
    expect(brandBox, "expected the brand bar").not.toBeNull();
    expect(layoutBox, "expected the home layout").not.toBeNull();
    if (!languageBox || !brandBox || !layoutBox)
      throw new Error("Expected home controls.");
    expect(
      languageBox.x,
      "language switch must not touch the left edge",
    ).toBeGreaterThanOrEqual(16);
    expect(
      languageBox.y,
      "language switch must not touch the brand-bar divider",
    ).toBeGreaterThanOrEqual(brandBox.y + brandBox.height + 12);
    expect(
      layoutBox.y,
      "the language control must not add a blank row above the creation panel",
    ).toBeLessThanOrEqual(brandBox.y + brandBox.height + 1);

    await page.getByRole("button", { name: "中文" }).click();

    await expect(
      page.getByRole("heading", { name: "发牌交给我，牌局由你掌握" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "创建牌局" })).toBeVisible();
    await expect(page.getByText("可信主机", { exact: true })).toBeVisible();
    await expect(page.locator(".preflight-list")).toContainText(
      "安全的牌面与消息加密",
    );
    await expect(page.getByRole("button", { name: "创建牌局" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
    await page.screenshot({
      path: capturePath(testInfo, "language-host-create-zh.png"),
      fullPage: true,
    });
  });

  test("a local language choice survives reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "中文" }).click();
    await page.reload();

    await expect(page.getByRole("heading", { name: "创建牌局" })).toBeVisible();
    await expect(page.getByRole("button", { name: "EN" })).toBeVisible();
  });

  test("a Host Chinese default seeds a new invitation while local English wins after override", async ({
    browser,
    page: host,
  }, testInfo) => {
    await host.goto("/");
    await host.getByRole("button", { name: "中文" }).click();
    await host.getByRole("button", { name: "创建牌局" }).click();
    const invitation = await host.locator(".invite-link input").inputValue();

    const playerContext = await browser.newContext();
    try {
      const player = await playerContext.newPage();
      await player.goto(invitation);
      await expect(
        player.getByRole("heading", { name: "加入这桌牌局" }),
      ).toBeVisible();
      await player.setViewportSize({ width: 390, height: 844 });
      await player.screenshot({
        path: capturePath(
          testInfo,
          "language-player-invitation-zh-390x844.png",
        ),
        fullPage: true,
      });

      await player.getByRole("button", { name: "EN" }).click();
      await expect(
        player.getByRole("heading", { name: "Join this table" }),
      ).toBeVisible();
      await player.reload();
      await expect(
        player.getByRole("heading", { name: "Join this table" }),
      ).toBeVisible();
    } finally {
      await playerContext.close();
    }
  });

  test("Chinese tablet controls remain readable on an iPad-sized table", async ({
    context,
    page: host,
  }, testInfo) => {
    await host.setViewportSize({ width: 1024, height: 768 });
    await host.goto("/");
    await host.getByRole("button", { name: "中文" }).click();
    await host.getByRole("button", { name: "创建牌局" }).click();

    for (const name of ["Alice", "Bob"]) {
      const invitation = await host.locator(".invite-link input").inputValue();
      const player = await context.newPage();
      await player.goto(invitation, { waitUntil: "commit" });
      await player.getByLabel("显示名称").fill(name);
      await player.getByRole("button", { name: "加入牌局" }).click();
      await expect(
        player.getByRole("heading", { name: "你已获得座位" }),
      ).toBeVisible();
    }

    await host.getByRole("button", { name: "发第一手牌" }).click();
    await host.getByRole("button", { name: "牌桌视图" }).click();
    await host
      .locator(
        '[data-qa-control="tablet-corner-open"][data-qa-variant="lower-right"]',
      )
      .click();
    await host.getByRole("button", { name: "更多牌桌控制" }).click();
    await expect(host.getByRole("heading", { name: "牌桌控制" })).toBeVisible();
    const connectionStatus = host.getByText("已连接", { exact: true });
    await expect(connectionStatus).toBeVisible();
    await expect(connectionStatus).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(connectionStatus).toHaveCSS("border-top-style", "none");

    const [statusBox, menuBox] = await Promise.all([
      connectionStatus.boundingBox(),
      host.locator(".secondary-controls").boundingBox(),
    ]);
    expect(statusBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(
      Math.abs(
        statusBox!.x + statusBox!.width / 2 - (menuBox!.x + menuBox!.width / 2),
      ),
    ).toBeLessThanOrEqual(1);
    await host.waitForTimeout(300);
    await host.screenshot({
      path: capturePath(testInfo, "language-tablet-controls-zh-1024x768.png"),
      fullPage: true,
    });
  });
});
