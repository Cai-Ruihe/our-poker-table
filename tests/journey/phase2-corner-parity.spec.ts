import { expect, test, type Page } from "@playwright/test";

test("Phase 2 retains all four Phase 1 corner marks exactly", async ({
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
      await host.bringToFront();
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
  async function geometry(page: Page) {
    return page.locator("[data-table-corner-glyph]").evaluateAll((glyphs) =>
      glyphs.map((glyph) => {
        const bounds = glyph.getBoundingClientRect();
        const style = getComputedStyle(glyph);
        return {
          markup: glyph.outerHTML,
          bounds: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          },
          color: style.color,
          opacity: style.opacity,
          transform: style.transform,
          children: [...glyph.children].map((child) => {
            const css = getComputedStyle(child);
            return {
              fill: css.fill,
              stroke: css.stroke,
              width: css.strokeWidth,
              cap: css.strokeLinecap,
              join: css.strokeLinejoin,
            };
          }),
        };
      }),
    );
  }
  expect(await geometry(candidate)).toEqual(await geometry(retained));
  async function comparePixels(page: Page, before: Buffer, after: Buffer) {
    return page.evaluate(
      async ({ before, after }) => {
        async function decodePng(base64: string) {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d", {
            willReadFrequently: true,
          });
          if (!context) throw new Error("Canvas 2D is unavailable");
          context.drawImage(image, 0, 0);
          return {
            width: canvas.width,
            height: canvas.height,
            data: context.getImageData(0, 0, canvas.width, canvas.height).data,
          };
        }

        const [left, right] = await Promise.all([
          decodePng(before),
          decodePng(after),
        ]);
        if (left.width !== right.width || left.height !== right.height)
          return {
            sameDimensions: false,
            leftSize: [left.width, left.height],
            rightSize: [right.width, right.height],
            changedPixels: -1,
            changedChannels: -1,
            maxChannelDelta: -1,
            changedBounds: null,
          };

        let changedPixels = 0;
        let changedChannels = 0;
        let maxChannelDelta = 0;
        let minX = left.width;
        let minY = left.height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < left.height; y++) {
          for (let x = 0; x < left.width; x++) {
            const offset = (y * left.width + x) * 4;
            let changed = false;
            for (let channel = 0; channel < 4; channel++) {
              const delta = Math.abs(
                left.data[offset + channel]! - right.data[offset + channel]!,
              );
              if (delta === 0) continue;
              changed = true;
              changedChannels++;
              maxChannelDelta = Math.max(maxChannelDelta, delta);
            }
            if (!changed) continue;
            changedPixels++;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        return {
          sameDimensions: true,
          width: left.width,
          height: left.height,
          changedPixels,
          changedChannels,
          maxChannelDelta,
          changedBounds:
            changedPixels === 0 ? null : { minX, minY, maxX, maxY },
        };
      },
      { before: before.toString("base64"), after: after.toString("base64") },
    );
  }
  // The SVG is 58% opaque, so its own background still composites with the
  // table gradient. Normalize the button behind it while preserving the mark's
  // rendered opacity and stroke colors.
  for (const page of [retained, candidate])
    await page.locator("[data-table-corner-glyph]").evaluateAll((glyphs) =>
      glyphs.forEach((glyph) => {
        (glyph as SVGElement).style.background = "transparent";
        (glyph.parentElement as HTMLButtonElement).style.background = "#003d33";
      }),
    );
  for (let index = 0; index < 4; index++) {
    const before = await retained
      .locator("[data-table-corner-glyph]")
      .nth(index)
      .screenshot({
        path: testInfo.outputPath(`retained-corner-${index}.png`),
      });
    const after = await candidate
      .locator("[data-table-corner-glyph]")
      .nth(index)
      .screenshot({
        path: testInfo.outputPath(`candidate-corner-${index}.png`),
      });
    const diff = await comparePixels(retained, before, after);
    expect(
      diff,
      `Corner ${index} differs at decoded PNG pixel level: ${JSON.stringify(diff)}`,
    ).toMatchObject({
      sameDimensions: true,
      changedPixels: 0,
      changedChannels: 0,
      maxChannelDelta: 0,
      changedBounds: null,
    });
  }
  await candidate.screenshot({
    path: testInfo.outputPath("phase2-corner-parity.png"),
  });
});
