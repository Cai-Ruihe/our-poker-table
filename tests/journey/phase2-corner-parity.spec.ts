import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test("Digital table corner marks use the canonical brand module; retained Phase 1 is unchanged", async ({
  context,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("phase-release"),
    "Requires retained Phase 1 packaging.",
  );
  await context.route("**/poker-config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.__HTML_POKER_CONFIG__ = {};",
    }),
  );
  async function start(path: string): Promise<Page> {
    const host = await context.newPage();
    await host.goto(path, { waitUntil: "commit" });
    await host.getByRole("button", { name: "Create table" }).click();
    for (const name of ["Alice", "Bob"]) {
      const player = await context.newPage();
      await player.goto(
        await host.getByLabel("Player invitation link").inputValue(),
        { waitUntil: "commit" },
      );
      await player.getByLabel("Display name").fill(name);
      await player.getByRole("button", { name: "Join table" }).click();
      await expect(
        player.getByRole("heading", { name: "You have a seat" }),
      ).toBeVisible({ timeout: 15000 });
    }
    await host.getByRole("button", { name: "Deal first hand" }).click();
    await host.locator('[data-qa-control="device-view-tablet"]').click();
    await expect(host.locator("[data-table-corner-glyph]")).toHaveCount(4);
    return host;
  }
  const retained = await start("/table-side/");
  const candidate = await start("/multiplayer/");
  // The prior equality-only check compared two stale straight-L renderings.
  // The signed brand asset, not that known-bad screenshot, owns the geometry.
  const asset = await readFile("assets/brand/svg/symbol-gold.svg", "utf8");
  const path = /<path d="([^"]+)"/.exec(asset)?.[1];
  const circle = /<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/.exec(asset);
  if (!path || !circle) throw new Error("Canonical corner asset missing");
  const glyphs = candidate.locator("[data-table-corner-glyph]");
  for (let index = 0; index < 4; index++) {
    const glyph = glyphs.nth(index);
    await expect(glyph.locator("path")).toHaveAttribute("d", path);
    await expect(glyph.locator("circle")).toHaveAttribute("cx", circle[1]!);
    await expect(glyph.locator("circle")).toHaveAttribute("cy", circle[2]!);
    await expect(glyph.locator("circle")).toHaveAttribute("r", circle[3]!);
    const gap = await glyph.evaluate((element) => {
      const stroke = element.querySelector("path")!;
      const dot = element.querySelector("circle")!;
      const a = stroke.getBoundingClientRect(),
        b = dot.getBoundingClientRect();
      return {
        gap: Math.max(
          a.left - b.right,
          b.left - a.right,
          a.top - b.bottom,
          b.top - a.bottom,
        ),
        cap: getComputedStyle(stroke).strokeLinecap,
      };
    });
    expect(gap.cap).toBe("butt");
    expect(gap.gap).toBeGreaterThan(1);
    const button = candidate
      .locator('[data-qa-control="tablet-corner-open"]')
      .nth(index);
    const bounds = await button.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(52);
    expect(bounds?.height).toBeGreaterThanOrEqual(52);
    await button.screenshot({
      path: testInfo.outputPath(`canonical-corner-${index}.png`),
    });
  }
  await expect(
    retained.locator("[data-table-corner-glyph] path").first(),
  ).toHaveAttribute("d", "M4 20V4H20");
});
