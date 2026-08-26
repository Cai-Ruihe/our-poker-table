import { pathToFileURL } from "node:url";
import path from "node:path";

import { expect, test } from "@playwright/test";

const landingFile = path.join(process.cwd(), "apps", "landing", "index.html");

test("the local landing file opens with its styling and product renders", async ({
  page,
}) => {
  await page.goto(pathToFileURL(landingFile).href);

  await expect(page.locator(".hero__table")).toHaveCSS("display", "grid");
  await expect
    .poll(() =>
      page
        .locator("[data-hero-ipad] img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);

  const chipArtwork = page.locator("[data-hero-chip-artwork]");
  await expect(chipArtwork).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const chip = chipArtwork.nth(index);
    await expect(chip).toHaveAttribute(
      "src",
      /hero-chip-(?:black-stack|green-stack|red-stack|blue)(?:-[A-Za-z0-9_-]+)?\.png$/u,
    );
    await expect
      .poll(() =>
        chip.evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
  }
});
