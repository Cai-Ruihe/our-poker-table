import path from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "@playwright/test";

const airplaneUrl = pathToFileURL(
  path.join(process.cwd(), "dist", "airplane", "poker-airplane.html"),
).toString();

function capturePath(
  testInfo: { outputPath: (name: string) => string },
  name: string,
): string {
  const directory = process.env.HTML_POKER_CAPTURE_DIR;
  return directory ? `${directory}/${name}` : testInfo.outputPath(name);
}

function dataUrlFile(source: string, name: string) {
  const match = /^data:image\/png;base64,(.+)$/u.exec(source);
  if (!match?.[1]) throw new Error("Expected an inlined QR PNG.");
  return {
    buffer: Buffer.from(match[1], "base64"),
    mimeType: "image/png",
    name,
  };
}

test("Airplane keeps the language choice local on its home surface", async ({
  page,
}, testInfo) => {
  await page.goto(airplaneUrl);
  await expect(
    page.getByRole("button", { name: "Create table" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.getByRole("button", { name: "创建牌局" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "加入离线牌局" }),
  ).toBeVisible();
  await page.screenshot({
    path: capturePath(testInfo, "language-airplane-home-zh.png"),
    fullPage: true,
  });

  await page.reload();
  await expect(page.getByRole("button", { name: "创建牌局" })).toBeVisible();
});

test("an Airplane player adopts the Host Chinese default until choosing locally", async ({
  browser,
  page: host,
}, testInfo) => {
  await host.goto(airplaneUrl);
  await host.getByRole("button", { name: "中文" }).click();
  await host.getByRole("button", { name: "创建牌局" }).click();
  await host.getByRole("button", { name: "配对玩家" }).click();
  const offer = await host
    .getByAltText("Player Airplane offer QR code")
    .getAttribute("src");
  if (!offer) throw new Error("The Airplane offer QR did not render.");

  const playerContext = await browser.newContext();
  try {
    const player = await playerContext.newPage();
    await player.goto(airplaneUrl);
    await player
      .getByRole("button", { name: "Join an Airplane table" })
      .click();
    await player.getByRole("button", { name: "Scan host offer QR" }).click();
    await player
      .getByRole("dialog", { name: "Scan host offer QR" })
      .getByLabel("Use a saved QR image")
      .setInputFiles(dataUrlFile(offer, "host-offer.png"));

    await expect(
      player.getByRole("heading", { name: "向主机展示回应码" }),
    ).toBeVisible({ timeout: 12_000 });
    await expect(player.locator("html")).toHaveAttribute("lang", "zh-Hans");
    await player.screenshot({
      path: capturePath(
        testInfo,
        "language-airplane-player-host-default-zh.png",
      ),
      fullPage: true,
    });
    await player.getByRole("button", { name: "EN" }).click();
    await expect(
      player.getByRole("heading", { name: "Show the answer to the host" }),
    ).toBeVisible();
  } finally {
    await playerContext.close();
  }
});
