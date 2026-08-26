import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("the commercial introduction opens the real table without becoming a casino site", async ({
  page,
}) => {
  await page.goto("/intro/");

  await expect(page).toHaveTitle(
    "Our Poker Table — A quiet digital dealer for physical poker",
  );
  await expect(
    page.getByRole("heading", { name: "Deal cards Keep poker yours" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Table-side Mode" }).first(),
  ).toHaveAttribute("href", "../table-side/");
  await expect(
    page.getByRole("link", { name: "Open Table-side Mode" }),
  ).toHaveCount(1);
  await expect(page.locator(".site-header")).toHaveCSS("position", "sticky");
  await expect(
    page.locator(".site-header").getByRole("radio", { name: "中文" }),
  ).toBeAttached();
  for (const languageLabel of ["EN", "中文"]) {
    const box = await page
      .getByText(languageLabel, { exact: true })
      .boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const airplaneDownload = page
    .getByRole("link", { name: "Download Airplane Mode HTML" })
    .first();
  await expect(airplaneDownload).toHaveAttribute(
    "href",
    "../poker-airplane.html",
  );
  await expect(airplaneDownload).toHaveAttribute(
    "download",
    "poker-airplane.html",
  );
  await expect(airplaneDownload).toHaveAttribute("type", "text/html");
  await expect(page.getByText("Play chips only").first()).toBeVisible();
  await expect(page.getByText(/cash-out|rake|casino lobby/iu)).toHaveCount(0);

  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations).toEqual([]);
});

test("the hero stages the shared table as an iPad with a player phone and physical chips", async ({
  page,
}) => {
  await page.goto("/intro/");

  const scene = page.locator("[data-play-scene]");
  await expect(scene).toBeVisible();
  await expect(scene.locator("[data-hero-ipad]")).toHaveCount(1);
  await expect(scene.locator("[data-hero-player-phone]")).toHaveCount(1);
  await expect(scene.locator("[data-hero-opponent-phone]")).toHaveCount(1);
  await expect(
    scene.locator("[data-hero-opponent-phone] .hero__android-camera"),
  ).toHaveCount(1);
  await expect(
    scene.locator("[data-hero-player-phone] .hero__iphone-dynamic-island"),
  ).toHaveCount(1);
  await expect(
    scene.locator("[data-hero-opponent-phone] .hero__iphone-dynamic-island"),
  ).toHaveCount(0);
  const chipArtwork = scene.locator("[data-hero-chip-artwork]");
  await expect(chipArtwork).toHaveCount(4);
  await expect(
    scene.locator("[data-hero-chip-stack], .hero__chip-face, .hero__chip-side"),
  ).toHaveCount(0);
  for (let index = 0; index < 4; index += 1) {
    const chip = chipArtwork.nth(index);
    await expect(chip).toHaveAttribute("aria-hidden", "true");
    await expect(chip).toHaveAttribute("alt", "");
    await expect(chip).toHaveAttribute(
      "src",
      /hero-chip-(?:black-stack|green-stack|red-stack|blue)(?:-[A-Za-z0-9_-]+)?\.png$/u,
    );
    expect(
      await chip.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    const chipBox = await chip.boundingBox();
    expect(chipBox).not.toBeNull();
    expect((chipBox?.height ?? 0) / (chipBox?.width ?? 1)).toBeGreaterThan(0.8);
  }
  const chipBoxes = await Promise.all(
    (await chipArtwork.all()).map((chip) => chip.boundingBox()),
  );
  const largestChipWidth = Math.max(
    ...chipBoxes.map((chipBox) => chipBox?.width ?? 0),
  );
  const chipVerticalRange =
    Math.max(
      ...chipBoxes.map((chipBox) => (chipBox?.y ?? 0) + (chipBox?.height ?? 0)),
    ) - Math.min(...chipBoxes.map((chipBox) => chipBox?.y ?? 0));
  expect(chipVerticalRange / largestChipWidth).toBeGreaterThan(1.4);
  const chipScale = await chipArtwork.evaluateAll((chips) => {
    const sceneWidth =
      chips[0]?.parentElement?.getBoundingClientRect().width ?? 1;
    return chips.map((chip) => {
      const width = Number.parseFloat(getComputedStyle(chip).width);
      return width / sceneWidth;
    });
  });
  expect(Math.max(...chipScale) - Math.min(...chipScale)).toBeLessThanOrEqual(
    0.001,
  );
  for (const scale of chipScale) {
    expect(scale).toBeCloseTo(0.12, 2);
  }

  for (const device of [
    scene.locator("[data-hero-ipad]"),
    scene.locator("[data-hero-player-phone]"),
    scene.locator("[data-hero-opponent-phone]"),
  ]) {
    await expect(device).toHaveCSS("background-image", "none");
  }

  const ipadScreen = scene.locator("[data-hero-ipad] img");
  await expect(ipadScreen).toHaveAttribute(
    "src",
    /hero-shared-board-ipad(?:-[A-Za-z0-9_-]+)?\.png$/u,
  );
  const phoneScreen = scene.locator("[data-hero-player-phone] img");
  await expect(phoneScreen).toHaveAttribute(
    "src",
    /hero-player-private-board(?:-[A-Za-z0-9_-]+)?\.png$/u,
  );

  const opponentPhoneScreen = scene.locator("[data-hero-opponent-phone] img");
  await expect(opponentPhoneScreen).toHaveAttribute(
    "src",
    /hero-player-android-public-board(?:-[A-Za-z0-9_-]+)?\.png$/u,
  );

  const ipadBox = await scene.locator("[data-hero-ipad]").boundingBox();
  const playerPhoneBox = await scene
    .locator("[data-hero-player-phone]")
    .boundingBox();
  const opponentPhoneBox = await scene
    .locator("[data-hero-opponent-phone]")
    .boundingBox();
  expect(ipadBox).not.toBeNull();
  expect(playerPhoneBox).not.toBeNull();
  expect(opponentPhoneBox).not.toBeNull();
  expect((ipadBox?.width ?? 0) / (playerPhoneBox?.width ?? 1)).toBeCloseTo(
    247.6 / 71.5,
    1,
  );
  expect((ipadBox?.height ?? 0) / (playerPhoneBox?.height ?? 1)).toBeCloseTo(
    178.5 / 149.6,
    1,
  );
  expect(
    (opponentPhoneBox?.width ?? 0) / (opponentPhoneBox?.height ?? 1),
  ).toBeCloseTo(77.9 / 164.4, 2);
  expect((ipadBox?.width ?? 0) / (opponentPhoneBox?.width ?? 1)).toBeCloseTo(
    247.6 / 77.9,
    1,
  );
  expect(largestChipWidth / (ipadBox?.width ?? 1)).toBeGreaterThanOrEqual(
    39 / 247.6,
  );
  const iPadFrame = await scene.locator("[data-hero-ipad]").evaluate((node) => {
    const outer = node.getBoundingClientRect();
    const screen = node
      .querySelector(".hero__ipad-screen")
      ?.getBoundingClientRect();
    if (!screen) {
      throw new Error("The iPad display frame is missing");
    }
    return {
      bottom: outer.bottom - screen.bottom,
      left: screen.left - outer.left,
      right: outer.right - screen.right,
      screenRatio: screen.width / screen.height,
      top: screen.top - outer.top,
      outerHeight: outer.height,
      outerWidth: outer.width,
    };
  });
  expect(Math.abs(iPadFrame.left - iPadFrame.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(iPadFrame.top - iPadFrame.bottom)).toBeLessThanOrEqual(1);
  expect(iPadFrame.screenRatio).toBeCloseTo(2360 / 1640, 2);
  const iPhoneFrame = await scene
    .locator("[data-hero-player-phone]")
    .evaluate((node) => {
      const outer = node.getBoundingClientRect();
      const screen = node
        .querySelector(".hero__player-phone-screen")
        ?.getBoundingClientRect();
      if (!screen) {
        throw new Error("The iPhone display frame is missing");
      }
      return {
        bottom: outer.bottom - screen.bottom,
        left: screen.left - outer.left,
        right: outer.right - screen.right,
        screenRatio: screen.width / screen.height,
        top: screen.top - outer.top,
        outerHeight: outer.height,
        outerWidth: outer.width,
      };
    });
  expect(iPhoneFrame.left / iPhoneFrame.outerWidth).toBeCloseTo(0.0323, 2);
  expect(iPhoneFrame.right / iPhoneFrame.outerWidth).toBeCloseTo(0.0323, 2);
  expect(iPhoneFrame.top / iPhoneFrame.outerHeight).toBeCloseTo(0.014, 2);
  expect(iPhoneFrame.bottom / iPhoneFrame.outerHeight).toBeCloseTo(0.014, 2);
  expect(iPhoneFrame.screenRatio).toBeCloseTo(1206 / 2622, 2);

  for (const screen of [ipadScreen, phoneScreen, opponentPhoneScreen]) {
    await expect
      .poll(() =>
        screen.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const geometry = await screen.evaluate((node) => {
      const image = node as HTMLImageElement;
      const box = image.getBoundingClientRect();
      return {
        naturalRatio: image.naturalWidth / image.naturalHeight,
        objectFit: getComputedStyle(image).objectFit,
        renderedRatio: box.width / box.height,
      };
    });
    expect(geometry.objectFit).not.toBe("cover");
    expect(
      Math.abs(geometry.renderedRatio - geometry.naturalRatio) /
        geometry.naturalRatio,
    ).toBeLessThanOrEqual(0.01);
  }
});

test("each stacked chip face projects toward the visual centre of the hero scene", async ({
  page,
}) => {
  const chipSelector =
    "[data-play-scene] [data-hero-chip-artwork]:not(.hero__chip-artwork--blue)";
  for (const width of [
    1024, 1366, 1800, 2048, 320, 390, 600, 720, 721, 850, 1051,
  ]) {
    await page.setViewportSize({ height: 1100, width });
    await page.goto("/intro/");

    const alignment = await page.locator(chipSelector).evaluateAll((chips) => {
      const scene = chips[0]?.closest("[data-play-scene]");
      if (!(scene instanceof HTMLElement)) {
        throw new Error("Expected the hero play scene");
      }

      const sceneBox = scene.getBoundingClientRect();
      const sceneCentre = {
        x: sceneBox.left + sceneBox.width / 2,
        y: sceneBox.top + sceneBox.height / 2,
      };

      return chips.map((chip) => {
        if (!(chip instanceof HTMLImageElement)) {
          throw new Error("Expected a static chip image");
        }
        const matrix = new DOMMatrix(getComputedStyle(chip).transform);
        const projectedVector = {
          x: -matrix.c,
          y: -matrix.d,
        };
        const chipBox = chip.getBoundingClientRect();
        const targetVector = {
          x: sceneCentre.x - (chipBox.left + chipBox.width / 2),
          y: sceneCentre.y - (chipBox.top + chipBox.height / 2),
        };
        const dot =
          projectedVector.x * targetVector.x +
          projectedVector.y * targetVector.y;
        const magnitude =
          Math.hypot(projectedVector.x, projectedVector.y) *
          Math.hypot(targetVector.x, targetVector.y);

        return dot / magnitude;
      });
    });

    for (const cosine of alignment) {
      expect(cosine).toBeGreaterThanOrEqual(0.999);
    }
  }
});

test("all four chips keep their cast shadows compact and soft", async ({
  page,
}) => {
  await page.goto("/intro/");

  const chipArtwork = page.locator(
    "[data-play-scene] [data-hero-chip-artwork]",
  );
  await expect(chipArtwork).toHaveCount(4);
  const shadows = await chipArtwork.evaluateAll((chips) =>
    chips.map((node) => {
      const image = node as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Expected a canvas context for chip artwork QA");
      }
      context.drawImage(image, 0, 0);
      const lowerStart = Math.floor(canvas.height * 0.97);
      const pixels = context.getImageData(
        0,
        lowerStart,
        canvas.width,
        canvas.height - lowerStart,
      ).data;
      let maxAlpha = 0;
      let minX = canvas.width;
      let maxX = -1;
      for (let pixel = 0; pixel < pixels.length; pixel += 4) {
        const alpha = pixels[pixel + 3] ?? 0;
        maxAlpha = Math.max(maxAlpha, alpha);
        if (alpha > 4) {
          const x = (pixel / 4) % canvas.width;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
      return {
        maxAlpha,
        spanRatio: maxX >= minX ? (maxX - minX + 1) / canvas.width : 0,
      };
    }),
  );

  for (const shadow of shadows) {
    expect(shadow.spanRatio).toBeGreaterThan(0.15);
    expect(shadow.spanRatio).toBeLessThanOrEqual(0.62);
    expect(shadow.maxAlpha).toBeGreaterThan(4);
    expect(shadow.maxAlpha).toBeLessThanOrEqual(50);
  }
});

test("the iPad screen aperture keeps the visible rounded display inside an even bezel", async ({
  page,
}) => {
  await page.goto("/intro/");

  const corners = await page.locator("[data-hero-ipad]").evaluate((shell) => {
    const screen = shell.querySelector<HTMLElement>("[data-screenshot-frame]");
    if (!screen) {
      throw new Error("Expected the iPad screen aperture");
    }

    const shellRect = shell.getBoundingClientRect();
    const screenRect = screen.getBoundingClientRect();
    const shellStyle = getComputedStyle(shell);
    const screenStyle = getComputedStyle(screen);
    const shellRadius = Number.parseFloat(shellStyle.borderTopLeftRadius);
    const screenRadius = Number.parseFloat(screenStyle.borderTopLeftRadius);
    const border = Number.parseFloat(shellStyle.borderLeftWidth);
    const bezels = [
      screenRect.left - shellRect.left - border,
      screenRect.top - shellRect.top - border,
      shellRect.right - screenRect.right - border,
      shellRect.bottom - screenRect.bottom - border,
    ];

    return { shellRadius, screenRadius, bezels };
  });

  expect(
    Math.max(...corners.bezels) - Math.min(...corners.bezels),
  ).toBeLessThanOrEqual(1);
  expect(corners.screenRadius / corners.shellRadius).toBeGreaterThanOrEqual(
    0.4,
  );
  expect(corners.screenRadius / corners.shellRadius).toBeLessThanOrEqual(0.52);
});

test("the iPhone display keeps the product render inside its rounded aperture", async ({
  page,
}) => {
  await page.goto("/intro/");

  const screen = page.locator(
    "[data-hero-player-phone] .hero__player-phone-screen",
  );
  await screen.scrollIntoViewIfNeeded();
  const aperture = await screen.evaluate((screenNode) => {
    const style = getComputedStyle(screenNode);
    return {
      clipPath: style.clipPath,
      corners: [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomLeftRadius,
        style.borderBottomRightRadius,
      ],
      overflow: style.overflow,
    };
  });

  expect(aperture.overflow).toBe("hidden");
  expect(aperture.clipPath).not.toBe("none");
  for (const corner of aperture.corners) {
    expect(Number.parseFloat(corner)).toBeGreaterThan(0);
  }
});

test("primary actions use solid buttons and display headlines keep punctuation out", async ({
  page,
}) => {
  await page.goto("/intro/");

  const tableSideCta = page.getByRole("link", {
    name: "Open Table-side Mode",
  });
  const ctaStyle = await tableSideCta.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      textDecorationLine: style.textDecorationLine,
    };
  });
  expect(ctaStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(Number.parseFloat(ctaStyle.borderRadius)).toBeGreaterThan(0);
  expect(ctaStyle.textDecorationLine).toBe("none");

  await page.getByText("中文", { exact: true }).click();
  const displayHeadings = page.locator(
    'h1 [data-lang="zh"], h2 [data-lang="zh"], h3 [data-lang="zh"]',
  );
  await expect(displayHeadings.first()).toBeVisible();
  const chineseDisplayCopy = await displayHeadings.allTextContents();
  for (const heading of chineseDisplayCopy) {
    expect(heading.trim()).not.toMatch(/[.。]$/u);
  }

  const chineseHeroStyle = await page
    .locator('#hero-title [data-lang="zh"]')
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        letterSpacing: Number.parseFloat(style.letterSpacing),
      };
    });
  expect(chineseHeroStyle.letterSpacing).toBeGreaterThanOrEqual(0);
  expect(chineseHeroStyle.fontSize).toBeLessThan(100);
});

test("the product reel lets the visitor move through one complete table story", async ({
  page,
}) => {
  await page.goto("/intro/");

  await expect(
    page.getByRole("heading", {
      name: "Watch one hand move around the table",
    }),
  ).toBeVisible();

  const radios = page.getByRole("radio", {
    name: /Start|Invite|Private|Host|Shared/u,
  });
  await expect(radios).toHaveCount(6);
  await expect(page.locator("[data-story-slide]")).toHaveCount(6);
  await expect(page.locator("[data-story-slide]:visible")).toHaveCount(1);

  const privateHand = page.getByRole("radio", { name: "Private hand" });
  await page.getByText("Private hand", { exact: true }).click();
  await expect(privateHand).toBeChecked();
  await expect(page.locator('[data-story-slide="private"]')).toBeVisible();

  await privateHand.focus();
  await privateHand.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "Private reveal" }),
  ).toBeChecked();
  await expect(page.locator('[data-story-slide="reveal"]')).toBeVisible();
  await expect(page.locator("[data-story-slide]:visible")).toHaveCount(1);
});

test("every marketing screenshot keeps its natural aspect ratio and full frame", async ({
  page,
}) => {
  await page.goto("/intro/");

  const assertCompleteImage = async (
    image: ReturnType<typeof page.locator>,
  ) => {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const geometry = await image.evaluate((node) => {
      const productImage = node as HTMLImageElement;
      const imageBox = productImage.getBoundingClientRect();
      const frame = productImage.closest("[data-screenshot-frame]");
      const frameBox = frame?.getBoundingClientRect();
      return {
        contained:
          Boolean(frameBox) &&
          imageBox.left >= frameBox!.left - 1 &&
          imageBox.right <= frameBox!.right + 1 &&
          imageBox.top >= frameBox!.top - 1 &&
          imageBox.bottom <= frameBox!.bottom + 1,
        naturalRatio: productImage.naturalWidth / productImage.naturalHeight,
        objectFit: getComputedStyle(productImage).objectFit,
        renderedRatio: imageBox.width / imageBox.height,
      };
    });
    expect(geometry.objectFit).not.toBe("cover");
    expect(geometry.contained).toBe(true);
    expect(
      Math.abs(geometry.renderedRatio - geometry.naturalRatio) /
        geometry.naturalRatio,
    ).toBeLessThanOrEqual(0.01);
  };

  await assertCompleteImage(page.locator("[data-hero-screenshot]"));

  for (const name of [
    "Start",
    "Invite",
    "Private hand",
    "Private reveal",
    "Host deals",
    "Shared result",
  ]) {
    await page
      .locator(".product-reel__controls")
      .getByText(name, { exact: true })
      .click();
    const selected = page.getByRole("radio", { name });
    await expect(selected).toBeChecked();
    const slide = page.locator("[data-story-slide]:visible");
    await assertCompleteImage(slide.locator("img"));
  }

  const howScreenshots = page.locator("[data-how-screenshot]");
  await expect(howScreenshots).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await assertCompleteImage(howScreenshots.nth(index));
  }
});

test("the landing page switches all visible product copy between English and Chinese", async ({
  page,
}) => {
  await page.goto("/intro/");

  const english = page.getByRole("radio", { name: "English" });
  const chinese = page.getByRole("radio", { name: "中文" });
  await expect(english).toBeChecked();
  await expect(
    page.getByRole("heading", {
      name: "Watch one hand move around the table",
    }),
  ).toBeVisible();

  await page.getByText("中文", { exact: true }).click();
  await expect(chinese).toBeChecked();
  await expect(
    page.getByRole("heading", { name: /一手牌如何\s*在桌上展开/u }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /每一手牌\s*都遵循同一套规则/u }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "桌边模式" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "飞行模式" })).toBeVisible();
  await expect(page.locator('[data-lang="en"]:visible')).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Watch one hand move around the table",
    }),
  ).toBeHidden();

  await page.getByText("EN", { exact: true }).click();
  await expect(english).toBeChecked();
});

test("the three-step start guide demonstrates Open, Invite, and Place with current renders", async ({
  page,
}) => {
  await page.goto("/intro/");

  const howScreenshots = page.locator("[data-how-screenshot]");
  await expect(howScreenshots).toHaveCount(3);
  await expect(howScreenshots.nth(0)).toHaveAttribute(
    "src",
    /home-start(?:-[A-Za-z0-9_-]+)?\.webp$/u,
  );
  await expect(howScreenshots.nth(1)).toHaveAttribute(
    "src",
    /host-lobby(?:-[A-Za-z0-9_-]+)?\.webp$/u,
  );
  await expect(howScreenshots.nth(2)).toHaveAttribute(
    "src",
    /shared-board(?:-[A-Za-z0-9_-]+)?\.webp$/u,
  );
});

test("the fairness section states the dealing invariants and the Trusted Host limit", async ({
  page,
}) => {
  await page.goto("/intro/");

  const fairness = page.locator("#fairness");
  await expect(
    fairness.getByRole("heading", {
      name: "Fair dealing in the current product version",
    }),
  ).toBeVisible();
  await expect(fairness).toContainText(/secure random-number generator/iu);
  await expect(fairness).toContainText(
    /exactly\s+52\s+unique standard cards/iu,
  );
  await expect(fairness).toContainText(/one card to each active seat/iu);
  await expect(fairness).toContainText(
    /does not choose cards by player name/iu,
  );
  await expect(fairness).toContainText(/host-blind|independently verifiable/iu);
  await expect(fairness).toContainText(
    /play\s+only\s+with\s+people\s+you\s+trust/iu,
  );
  await expect(fairness).toContainText(/current product version/iu);
  await expect(fairness).not.toContainText(/Phase 1/iu);
  await expect(fairness).not.toContainText(
    /impossible to cheat|cannot be rigged|uncheatable/iu,
  );
});

test("the Airplane CTA downloads the exact standalone artifact", async ({
  page,
}) => {
  const artifactPath = path.join(
    process.cwd(),
    "dist/airplane/poker-airplane.html",
  );

  await page.goto("/intro/");

  const downloadLink = page.getByRole("link", {
    name: "Download Airplane Mode HTML",
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click(),
  ]);

  expect(download.suggestedFilename()).toBe("poker-airplane.html");
  expect(page.url()).toMatch(/\/intro\/?$/u);
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();

  const source = await readFile(downloadedPath!, "utf8");
  expect(source).toBe(await readFile(artifactPath, "utf8"));
  expect(source).toContain(
    "<title>Our Poker Table Airplane — Standalone digital dealer</title>",
  );
  expect(source).toContain("connect-src 'none'");
  expect(source).not.toMatch(
    /<(?:script|link|img)\b[^>]*(?:src|href)=["']https?:/iu,
  );
});

test("the site root opens the introduction without replacing the Airplane artifact", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/intro\/$/u);
  await expect(
    page.getByRole("heading", { name: "Deal cards Keep poker yours" }),
  ).toBeVisible();

  await page.goto("/our-poker-table/");
  await expect(page).toHaveURL(/\/our-poker-table\/intro\/$/u);
  await expect(
    page.getByRole("heading", { name: "Deal cards Keep poker yours" }),
  ).toBeVisible();

  const expectedAirplane = await readFile(
    path.join(process.cwd(), "dist/airplane/poker-airplane.html"),
    "utf8",
  );
  for (const url of [
    "/poker-airplane.html",
    "/our-poker-table/poker-airplane.html",
  ]) {
    const airplaneResponse = await page.request.get(url);
    expect(airplaneResponse.status()).toBe(200);
    expect(await airplaneResponse.text()).toBe(expectedAirplane);
  }
});

test("the landing and Table-side routes survive a Pages project prefix", async ({
  page,
}) => {
  await page.goto("/our-poker-table/intro/");
  await expect(
    page.getByRole("heading", { name: "Deal cards Keep poker yours" }),
  ).toBeVisible();

  const tableSideLink = page
    .getByRole("link", { name: "Open Table-side Mode" })
    .first();
  const tableSideHref = await tableSideLink.getAttribute("href");
  expect(new URL(tableSideHref!, page.url()).pathname).toBe(
    "/our-poker-table/table-side/",
  );
  await tableSideLink.click();
  await expect(page).toHaveTitle(
    "Our Poker Table — Digital dealer for physical tables",
  );
  await expect(
    page.getByRole("link", { name: "Open Our Poker Table introduction" }),
  ).toBeVisible();
});

for (const width of [320, 390, 768, 1366]) {
  test(`the landing page remains intact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 720 ? 844 : 900 });
    await page.goto("/intro/");

    expect(
      await page.evaluate(() =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
      ),
    ).toBeLessThanOrEqual(width);
    const visibleImages = page.locator("img:visible");
    const imageCount = await visibleImages.count();
    for (let index = 0; index < imageCount; index += 1) {
      const image = visibleImages.nth(index);
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          image.evaluate(
            (element) => (element as HTMLImageElement).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
    }

    const primaryCta = page
      .getByRole("link", { name: "Open Table-side Mode" })
      .first();
    await expect(primaryCta).toBeVisible();
    expect(
      (await primaryCta.boundingBox())?.height ?? 0,
    ).toBeGreaterThanOrEqual(48);
  });
}
