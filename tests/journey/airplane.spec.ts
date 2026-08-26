import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { exerciseControl } from "./control-qa";

test.describe.configure({ mode: "default" });

const airplanePath = path.join(
  process.cwd(),
  "dist",
  "airplane",
  "poker-airplane.html",
);
const airplaneUrl = pathToFileURL(airplanePath).toString();

function dataUrlFile(source: string, name: string) {
  const match = /^data:image\/png;base64,(.+)$/u.exec(source);
  if (!match?.[1]) throw new Error("Expected an inlined QR PNG.");
  return {
    buffer: Buffer.from(match[1], "base64"),
    mimeType: "image/png",
    name,
  };
}

async function openAirplanePage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(airplaneUrl);
  await expect(
    page.getByRole("button", { name: "Create table" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Join an Airplane table" }),
  ).toBeVisible();
  return page;
}

async function unexplainedRedDecorations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--red)";
    document.body.append(probe);
    const red = getComputedStyle(probe).color;
    probe.remove();
    const allowed =
      ".action--danger, .card--red, .inline-warning, .surface-error, .undo-window";
    const findings: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      if (element.matches(allowed) || element.closest(allowed)) continue;
      for (const pseudo of [null, "::before", "::after"] as const) {
        const style = getComputedStyle(element, pseudo);
        const paintsRed =
          style.backgroundColor === red ||
          (style.borderTopStyle !== "none" && style.borderTopColor === red) ||
          (style.borderRightStyle !== "none" &&
            style.borderRightColor === red) ||
          (style.borderBottomStyle !== "none" &&
            style.borderBottomColor === red) ||
          (style.borderLeftStyle !== "none" && style.borderLeftColor === red);
        if (paintsRed) {
          findings.push(
            `${element.tagName.toLowerCase()}.${element.className || "(no-class)"}${pseudo ?? ""}`,
          );
        }
      }
    }
    return findings;
  });
}

async function pairPlayer(
  host: Page,
  player: Page,
  displayName: string,
): Promise<void> {
  const existingOffer = host.getByAltText("Player Airplane offer QR code");
  const previousOffer =
    (await existingOffer.count()) > 0
      ? await existingOffer.getAttribute("src")
      : null;
  const offerButton = previousOffer
    ? host.getByRole("button", { name: "New offer" }).first()
    : host.getByRole("button", { name: "Pair Player" });
  await offerButton.click();
  const offerImage = host.getByAltText("Player Airplane offer QR code");
  await expect(offerImage).toBeVisible();
  if (previousOffer) {
    await expect
      .poll(() => offerImage.getAttribute("src"))
      .not.toEqual(previousOffer);
  }
  const offerSource = await offerImage.getAttribute("src");
  if (!offerSource) throw new Error("The host offer QR did not render.");

  await player.getByRole("button", { name: "Join an Airplane table" }).click();
  await player.getByRole("button", { name: "Scan host offer QR" }).click();
  await player
    .getByRole("dialog", { name: "Scan host offer QR" })
    .getByLabel("Use a saved QR image")
    .setInputFiles(dataUrlFile(offerSource, `${displayName}-offer.png`));
  const answerImage = player.getByAltText("Airplane answer QR code");
  await expect(answerImage).toBeVisible({ timeout: 12_000 });
  const answerSource = await answerImage.getAttribute("src");
  if (!answerSource) throw new Error("The player answer QR did not render.");

  await host.getByRole("button", { name: "Scan Player answer QR" }).click();
  await host
    .getByRole("dialog", { name: "Scan Player answer QR" })
    .getByLabel("Use a saved QR image")
    .setInputFiles(dataUrlFile(answerSource, `${displayName}-answer.png`));
  await expect(
    host.getByText("Direct channel paired. The other device can now join."),
  ).toBeVisible({ timeout: 12_000 });
  await player.getByLabel("Display name").fill(displayName);
  await exerciseControl(
    "airplane-player-join-after-scan",
    player.locator('[data-qa-control="airplane-player-join-after-scan"]'),
    (target) => target.click(),
    () =>
      expect(
        player.getByRole("heading", { name: "You have a seat" }),
      ).toBeVisible(),
  );
  await expect(
    host.locator('button[aria-label^="Seat"]').filter({ hasText: displayName }),
  ).toHaveCount(1);
}

test("standalone artifact boots from file with no external request", async ({
  context,
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(airplaneUrl);

  await expect(page.getByRole("heading", { name: /Deal cards/ })).toBeVisible();
  expect(requests).toEqual([airplaneUrl]);
  const source = await readFile(airplanePath, "utf8");
  expect(source).not.toMatch(
    /<(?:script|link|img)\b[^>]*(?:src|href)="https?:/iu,
  );
  expect(source).toContain("airplaneMode:true");
  expect(source).toContain("html-poker-third-party-licenses");
  expect(source).toContain("html-poker-project-license");
  expect(source).toContain(
    "<title>Our Poker Table Airplane — Standalone digital dealer</title>",
  );
  // Airplane is deliberately the compact Four Colour build. Court artwork and
  // Table-side Mode's appearance picker must not be carried in this standalone
  // file merely because the runtime hides them.
  expect(source).not.toContain("data-court-rank");
  expect(source).not.toContain("court illustration");
  await expect(
    page.getByRole("group", { name: "Deck appearance" }),
  ).toHaveCount(0);
  expect(await context.cookies()).toEqual([]);
});

test("the Airplane start screen has no unexplained red ornaments", async ({
  context,
}) => {
  const page = await openAirplanePage(context);
  await expect(page.getByText("Build 0.1.6", { exact: true })).toBeVisible();
  expect(await unexplainedRedDecorations(page)).toEqual([]);
});

test("Airplane mode fixes the table to the Four Colour deck", async ({
  context,
}, testInfo: TestInfo) => {
  test.skip(
    testInfo.project.name === "mobile-webkit",
    "The file-origin host-self-join prerequisite has no local route in headless Mobile WebKit; Chromium and Android-like Chromium cover the complete automated deck journey.",
  );
  const host = await openAirplanePage(context);
  const player = await openAirplanePage(context);
  await host.getByRole("button", { name: "Create table" }).click();
  await pairPlayer(host, player, "Deck test player");
  await host.getByLabel("My display name").fill("Deck test host");
  await host
    .getByRole("button", { name: "Join my own table on this device" })
    .click();
  await host.getByRole("button", { name: "Host Controls" }).click();
  await host.getByRole("button", { name: "Deal first hand" }).click();
  await host.getByRole("button", { name: "Table View" }).click();
  await expect(host.locator(".table-surface")).toHaveAttribute(
    "data-card-style",
    "four-colour",
  );
  await host
    .locator(
      '[data-qa-control="tablet-corner-open"][data-qa-variant="lower-right"]',
    )
    .click();
  await host.locator('[data-qa-control="tablet-quick-more"]').click();
  await expect(host.locator(".secondary-controls")).toBeVisible();
  await expect(host.locator('[data-qa-control^="card-style-"]')).toHaveCount(0);
});

test("the host can enlarge a dense Airplane QR for phone scanning", async ({
  context,
}, testInfo: TestInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Headless Mobile WebKit cannot create the prerequisite file-origin WebRTC offer; the responsive enlarged QR uses the same component.",
  );
  const host = await openAirplanePage(context);
  await host.getByRole("button", { name: "Create table" }).click();
  await host.getByRole("button", { name: "Pair Player" }).click();

  await host.getByRole("button", { name: "Enlarge QR" }).click();

  await expect(
    host.getByRole("dialog", { name: "Enlarged Player pairing QR" }),
  ).toBeVisible();
  await expect(
    host.getByText("Do not use the phone's Camera app.", { exact: true }),
  ).toBeVisible();
  await expect(
    host.getByText(
      "On the phone, open this poker app, choose Join an Airplane table, then use Scan host offer QR.",
      { exact: true },
    ),
  ).toBeVisible();
  const bounds = await host
    .getByAltText("Enlarged Player Airplane offer QR code")
    .boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(500);
});

test("host answer scan opens the live camera with an image fallback", async ({
  context,
}, testInfo: TestInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Headless Mobile WebKit cannot create the prerequisite file-origin WebRTC offer; the join-side camera UI is still exercised there.",
  );
  const host = await openAirplanePage(context);
  await host.addInitScript(() => {
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          Reflect.set(globalThis, "__htmlPokerCameraRequests", 1);
          return new MediaStream();
        },
      },
    });
  });
  await host.reload();
  await host.getByRole("button", { name: "Create table" }).click();
  await host.getByRole("button", { name: "Pair Player" }).click();
  await expect(
    host.getByAltText("Player Airplane offer QR code"),
  ).toBeVisible();

  await host.getByRole("button", { name: "Scan Player answer QR" }).click();

  await expect(
    host.getByRole("dialog", { name: "Scan Player answer QR" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      host.evaluate(() => Reflect.get(globalThis, "__htmlPokerCameraRequests")),
    )
    .toBe(1);
  await expect(
    host.getByRole("button", { name: "Use a saved QR image" }),
  ).toBeVisible();
});

test("joining device scans the host offer with the live camera", async ({
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          Reflect.set(globalThis, "__htmlPokerCameraRequests", 1);
          return new MediaStream();
        },
      },
    });
  });
  const player = await openAirplanePage(context);
  await player.getByRole("button", { name: "Join an Airplane table" }).click();

  await player.getByRole("button", { name: "Scan host offer QR" }).click();

  await expect(
    player.getByRole("dialog", { name: "Scan host offer QR" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      player.evaluate(() =>
        Reflect.get(globalThis, "__htmlPokerCameraRequests"),
      ),
    )
    .toBe(1);
  await expect(
    player.getByRole("button", { name: "Use a saved QR image" }),
  ).toBeVisible();
});

test("scanner explains when this browser has no camera API", async ({
  context,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });
  const player = await openAirplanePage(context);
  await player.getByRole("button", { name: "Join an Airplane table" }).click();
  await player.getByRole("button", { name: "Scan host offer QR" }).click();

  const scanner = player.getByRole("dialog", { name: "Scan host offer QR" });
  await expect(scanner).toContainText(
    "This browser cannot open a camera from this file. Use a saved QR image instead.",
  );
  await expect(
    scanner.getByRole("button", { name: "Use a saved QR image" }),
  ).toBeVisible();
});

test("live camera frame decodes the host offer into an answer QR", async ({
  browser,
}, testInfo: TestInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "The deterministic canvas camera fixture and local file-origin WebRTC path are verified in Chromium; physical Mobile WebKit remains a release gate.",
  );
  const hostContext = await browser.newContext();
  const playerContext = await browser.newContext();
  try {
    const host = await openAirplanePage(hostContext);
    await host.getByRole("button", { name: "Create table" }).click();
    await host.getByRole("button", { name: "Pair Player" }).click();
    const offerImage = host.getByAltText("Player Airplane offer QR code");
    await expect(offerImage).toBeVisible();
    const offerSource = await offerImage.getAttribute("src");
    if (!offerSource) throw new Error("The host offer QR did not render.");

    await playerContext.addInitScript(async (source) => {
      Object.defineProperty(globalThis.navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const image = new Image();
            image.src = source;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = 1_280;
            canvas.height = 1_280;
            const drawing = canvas.getContext("2d");
            if (!drawing) throw new Error("Camera fixture canvas unavailable.");
            const paintFrame = () => {
              drawing.fillStyle = "#ffffff";
              drawing.fillRect(0, 0, canvas.width, canvas.height);
              drawing.drawImage(image, 128, 128, 1_024, 1_024);
            };
            paintFrame();
            const stream = canvas.captureStream(10);
            const refresh = globalThis.setInterval(paintFrame, 100);
            for (const track of stream.getTracks()) {
              const stop = track.stop.bind(track);
              track.stop = () => {
                globalThis.clearInterval(refresh);
                stop();
              };
            }
            return stream;
          },
        },
      });
    }, offerSource);
    const player = await openAirplanePage(playerContext);
    await player
      .getByRole("button", { name: "Join an Airplane table" })
      .click();
    await player.getByRole("button", { name: "Scan host offer QR" }).click();

    await expect(player.getByAltText("Airplane answer QR code")).toBeVisible({
      timeout: 12_000,
    });
  } finally {
    await Promise.all([hostContext.close(), playerContext.close()]);
  }
});

test("two players pair by two-way QR and deal over direct local WebRTC", async ({
  browser,
}, testInfo: TestInfo) => {
  test.skip(
    Boolean(process.env.CI),
    "GitHub-hosted Linux runners expose no usable local ICE interface; the real WebRTC journey remains mandatory in local Chromium and the physical-device release gate.",
  );
  test.skip(
    testInfo.project.name !== "chromium",
    "Headless Mobile WebKit did not produce a local ICE candidate from file:// after an eight-second probe. Its file-origin WebRTC support remains a physical-device release gate, while Chromium supplies the automated direct-pairing evidence.",
  );
  const hostContext = await browser.newContext();
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  try {
    const host = await openAirplanePage(hostContext);
    const alice = await openAirplanePage(aliceContext);
    const bob = await openAirplanePage(bobContext);
    await host.getByRole("button", { name: "Create table" }).click();
    await expect(
      host.getByRole("heading", { name: "Waiting for players" }),
    ).toBeVisible();

    await pairPlayer(host, alice, "Alice");
    await pairPlayer(host, bob, "Bob");
    await host.getByRole("button", { name: "Deal first hand" }).click();

    await expect(
      alice.getByRole("region", { name: "Your cards" }),
    ).toBeVisible();
    await expect(bob.getByRole("region", { name: "Your cards" })).toBeVisible();
    await expect(alice.locator("[data-private-card]")).toHaveCount(2);
    await expect(bob.locator("[data-private-card]")).toHaveCount(2);
    await expect(
      alice.getByText("Airplane · direct WebRTC", { exact: true }),
    ).toBeVisible();

    await host.getByRole("button", { name: "Deal the flop" }).click();
    await expect(alice.locator("[data-board-card]")).toHaveCount(3);
    await expect(bob.locator("[data-board-card]")).toHaveCount(3);
    await expect(host.locator("[data-private-card]")).toHaveCount(0);
  } finally {
    await Promise.all([
      hostContext.close(),
      aliceContext.close(),
      bobContext.close(),
    ]);
  }
});

test("a player reveals private cards with one clear local-only control", async ({
  browser,
}, testInfo: TestInfo) => {
  test.skip(
    Boolean(process.env.CI),
    "GitHub-hosted Linux runners expose no usable local ICE interface; the real WebRTC journey remains mandatory in local Chromium and the physical-device release gate.",
  );
  test.skip(
    testInfo.project.name !== "chromium",
    "Headless Mobile WebKit cannot establish the file-origin WebRTC prerequisite; the same responsive player UI is exercised in Chromium.",
  );
  const hostContext = await browser.newContext();
  const aliceContext = await browser.newContext({
    viewport: { height: 844, width: 390 },
  });
  const bobContext = await browser.newContext();
  try {
    await aliceContext.addInitScript(() => {
      Reflect.set(globalThis, "__htmlPokerWakeLockRequests", 0);
      Object.defineProperty(globalThis.navigator, "wakeLock", {
        configurable: true,
        value: {
          request: async () => {
            const requests = Number(
              Reflect.get(globalThis, "__htmlPokerWakeLockRequests"),
            );
            Reflect.set(
              globalThis,
              "__htmlPokerWakeLockRequests",
              requests + 1,
            );
            return {
              addEventListener: () => undefined,
              release: async () => undefined,
              released: false,
            };
          },
        },
      });
    });
    const host = await openAirplanePage(hostContext);
    const alice = await openAirplanePage(aliceContext);
    const bob = await openAirplanePage(bobContext);
    await host.getByRole("button", { name: "Create table" }).click();
    await pairPlayer(host, alice, "Alice");
    await pairPlayer(host, bob, "Bob");
    await host.getByRole("button", { name: "Deal first hand" }).click();
    await expect(
      alice.getByRole("region", { name: "Your cards" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        alice.evaluate(() =>
          Reflect.get(globalThis, "__htmlPokerWakeLockRequests"),
        ),
      )
      .toBe(1);
    expect(await unexplainedRedDecorations(alice)).toEqual([]);

    const reveal = alice.getByRole("button", {
      name: "Reveal my cards privately",
    });
    await expect(reveal).toBeVisible();
    await expect(
      alice.getByText("Only visible on this phone.", { exact: true }),
    ).toBeVisible();
    await expect(
      alice.getByRole("button", { name: "Show cards to table" }),
    ).toBeVisible();

    await reveal.click();

    await expect(
      alice.getByRole("button", { name: "Hide my cards" }),
    ).toBeVisible();
    await expect(host.locator("[data-shown-card]")).toHaveCount(0);
    await expect(bob.locator("[data-shown-card]")).toHaveCount(0);
  } finally {
    await Promise.all([
      hostContext.close(),
      aliceContext.close(),
      bobContext.close(),
    ]);
  }
});

test("a closed Airplane phone can be replaced into the same active seat", async ({
  browser,
}, testInfo: TestInfo) => {
  test.skip(
    Boolean(process.env.CI),
    "GitHub-hosted Linux runners expose no usable local ICE interface; the real WebRTC journey remains mandatory in local Chromium and the physical-device release gate.",
  );
  test.skip(
    testInfo.project.name !== "chromium",
    "Headless Mobile WebKit cannot establish the file-origin WebRTC prerequisite; physical iPhone replacement remains in the party checklist.",
  );
  const hostContext = await browser.newContext();
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const replacementContext = await browser.newContext({
    viewport: { height: 844, width: 390 },
  });
  try {
    const host = await openAirplanePage(hostContext);
    const alice = await openAirplanePage(aliceContext);
    const bob = await openAirplanePage(bobContext);
    await host.getByRole("button", { name: "Create table" }).click();
    await pairPlayer(host, alice, "Alice");
    await pairPlayer(host, bob, "Bob");
    await host.getByRole("button", { name: "Deal first hand" }).click();
    await expect(alice.locator("[data-private-card]")).toHaveCount(2);
    const cardsBeforeClose = await alice
      .locator("[data-private-card]")
      .evaluateAll((cards) =>
        cards.map((card) => card.getAttribute("data-card")),
      );
    await alice.close();

    await host.getByRole("button", { name: /^Players/ }).click();
    const aliceMapSeat = host.getByRole("button", {
      name: /^Seat 1, Alice,/u,
    });
    await aliceMapSeat.click();
    const aliceAdministration = host.getByLabel("Manage Alice");
    await aliceAdministration
      .getByRole("button", { name: "Replace device" })
      .click();
    await host
      .getByRole("button", { name: "Pair Replacement for Alice" })
      .click();
    const offerImage = host.getByAltText(
      "Replacement for Alice Airplane offer QR code",
    );
    await expect(offerImage).toBeVisible();
    const offerSource = await offerImage.getAttribute("src");
    if (!offerSource)
      throw new Error("The replacement offer QR did not render.");

    const replacement = await openAirplanePage(replacementContext);
    await replacement
      .getByRole("button", { name: "Join an Airplane table" })
      .click();
    await replacement
      .getByRole("button", { name: "Scan host offer QR" })
      .click();
    await replacement
      .getByRole("dialog", { name: "Scan host offer QR" })
      .getByLabel("Use a saved QR image")
      .setInputFiles(dataUrlFile(offerSource, "alice-replacement-offer.png"));
    const answerImage = replacement.getByAltText("Airplane answer QR code");
    await expect(answerImage).toBeVisible({ timeout: 12_000 });
    const answerSource = await answerImage.getAttribute("src");
    if (!answerSource)
      throw new Error("The replacement answer QR did not render.");

    await host
      .getByRole("button", { name: "Scan Replacement for Alice answer QR" })
      .click();
    await host
      .getByRole("dialog", {
        name: "Scan Replacement for Alice answer QR",
      })
      .getByLabel("Use a saved QR image")
      .setInputFiles(dataUrlFile(answerSource, "alice-replacement-answer.png"));
    await replacement.getByLabel("Display name").fill("Alice");
    await replacement
      .getByRole("button", { name: "Join after host scans" })
      .click();

    await expect(
      replacement.getByRole("region", { name: "Your cards" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        replacement
          .locator("[data-private-card]")
          .evaluateAll((cards) =>
            cards.map((card) => card.getAttribute("data-card")),
          ),
      )
      .toEqual(cardsBeforeClose);
    await expect(aliceMapSeat).toBeVisible();
  } finally {
    await Promise.all([
      hostContext.close(),
      aliceContext.close(),
      bobContext.close(),
      replacementContext.close(),
    ]);
  }
});
