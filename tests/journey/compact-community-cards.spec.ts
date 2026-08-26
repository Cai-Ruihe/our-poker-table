import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const styles = readFileSync(
  fileURLToPath(new URL("../../apps/web/src/styles.css", import.meta.url)),
  "utf8",
);
const tableStyles = readFileSync(
  fileURLToPath(new URL("../../apps/web/src/table.css", import.meta.url)),
  "utf8",
);
const presentationSource = readFileSync(
  fileURLToPath(
    new URL("../../packages/presentation/src/index.tsx", import.meta.url),
  ),
  "utf8",
);

const suitPaths = Object.fromEntries(
  [...presentationSource.matchAll(/^\s+([cdhs]): "([^"]+)"/gm)].map(
    ([, suit, path]) => [suit, path],
  ),
) as Record<string, string>;

const cards = [
  "Ac",
  "Ad",
  "Ah",
  "As",
  "2c",
  "2d",
  "2h",
  "2s",
  "3c",
  "3d",
  "3h",
  "3s",
  "4c",
  "4d",
  "4h",
  "4s",
  "5c",
  "5d",
  "5h",
  "5s",
  "6c",
  "6d",
  "6h",
  "6s",
  "7c",
  "7d",
  "7h",
  "7s",
  "8c",
  "8d",
  "8h",
  "8s",
  "9c",
  "9d",
  "9h",
  "9s",
  "Tc",
  "Td",
  "Th",
  "Ts",
  "Jc",
  "Jd",
  "Jh",
  "Js",
  "Qc",
  "Qd",
  "Qh",
  "Qs",
  "Kc",
  "Kd",
  "Kh",
  "Ks",
] as const;

// The first row is intentionally a deterministic five-card community rail:
// it includes all four suits while exercising a wide rank range. The full
// 52-card matrix below keeps the geometry/color contract exhaustive.
const focusCards = ["Kd", "7c", "6h", "Ts", "9d"] as const;
const smallestCards = ["Kd", "7c", "6h"] as const;

const fourColour = {
  c: "rgb(32, 127, 89)",
  d: "rgb(39, 120, 197)",
  h: "rgb(201, 59, 67)",
  s: "rgb(27, 36, 48)",
} as const;

function renderCards(
  cardStyle: "classic" | "four-colour",
  sourceCards: readonly string[],
  group: "focus" | "coverage",
): string {
  return sourceCards
    .map((card) => {
      const rank = card[0];
      const suit = card[1] as keyof typeof suitPaths | undefined;
      if (!rank || !suit) {
        throw new Error(`Invalid compact-card fixture: ${card}`);
      }
      const displayRank = cardStyle === "classic" && rank === "T" ? "10" : rank;
      return `
        <span
          aria-label="${rank} of ${suit}"
          class="card card--${cardStyle} card--suit-${suit} card--minimal"
          data-board-card="true"
          data-board-group="${group}"
          data-card="${card}"
          role="img"
        >
          <span class="card__corner card__corner--top" aria-hidden="true">
            <span class="card__rank">${displayRank}</span>
            <span class="card__corner-suit">
              <svg aria-hidden="true" class="card__suit-glyph" focusable="false" viewBox="0 0 100 100">
                <path d="${suitPaths[suit]}" fill="currentColor"></path>
              </svg>
            </span>
          </span>
        </span>
      `;
    })
    .join("");
}

function renderSmallestCards(cardStyle: "classic" | "four-colour"): string {
  return smallestCards
    .map((card) => {
      const rank = card[0]!;
      const suit = card[1]! as keyof typeof suitPaths;
      return `
        <span
          class="card card--${cardStyle} card--suit-${suit} card--compact"
          data-card="${card}"
          data-smallest-card="true"
          role="img"
        >
          <span class="card__corner card__corner--top" aria-hidden="true">
            <span class="card__rank">${rank}</span>
            <span class="card__corner-suit">
              <svg aria-hidden="true" class="card__suit-glyph" focusable="false" viewBox="0 0 100 100">
                <path d="${suitPaths[suit]}" fill="currentColor"></path>
              </svg>
            </span>
          </span>
        </span>
      `;
    })
    .join("");
}

test("Table-side compact community cards keep rank and suit readable on phone engines", async ({
  page,
}, testInfo) => {
  // Six complete CSS layouts (three phone widths × two deck styles) are
  // deliberate coverage. Linux mobile emulation can exceed Playwright's
  // generic 30-second limit under the serial release suite.
  test.setTimeout(60_000);
  const viewports = [
    { width: 360, height: 800 },
    { width: 393, height: 852 },
    { width: 412, height: 915 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const cardStyle of ["classic", "four-colour"] as const) {
      await page.setContent(`
      <style>${styles}\n${tableStyles}\n
        body { min-width: 0; background: #0b3f34; }
        .table-surface { min-height: 100vh; padding: 1rem; }
        .table-surface .player-board { width: 100%; padding: 1rem; }
      </style>
      <main class="table-surface" data-card-style="${cardStyle}">
        <section class="player-board" aria-label="Community cards">
          <section class="dealer-rail">
            <div class="dealer-rail__cards" data-board-row="focus">${renderCards(cardStyle, focusCards, "focus")}</div>
            <div class="dealer-rail__cards" data-board-row="coverage">${renderCards(cardStyle, cards, "coverage")}</div>
          </section>
        </section>
        <section class="seat-tile" aria-label="Smallest shown-card treatment">
          <div class="mini-hand">${renderSmallestCards(cardStyle)}</div>
        </section>
      </main>
    `);
      await page.evaluate(async () => document.fonts.ready);

      const metrics = await page
        .locator('[data-board-card][data-board-group="coverage"]')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const card = element.getBoundingClientRect();
            const rankElement = element.querySelector(".card__rank")!;
            const rank = rankElement.getBoundingClientRect();
            const suitElement = element.querySelector(".card__corner-suit")!;
            const suit = suitElement.getBoundingClientRect();
            const glyph = suitElement.querySelector("svg")!;
            const path = glyph.querySelector("path")!;
            const pathBox = path.getBBox();
            return {
              card: {
                bottom: card.bottom,
                left: card.left,
                right: card.right,
                top: card.top,
              },
              cardCenter: card.left + card.width / 2,
              rank: {
                bottom: rank.bottom,
                center: rank.left + rank.width / 2,
                left: rank.left,
                right: rank.right,
                top: rank.top,
              },
              suit: {
                bottom: suit.bottom,
                center: suit.left + suit.width / 2,
                left: suit.left,
                right: suit.right,
                top: suit.top,
              },
              suitCode: element.getAttribute("data-card")!.slice(-1),
              clubPath: path.getAttribute("d")!,
              rankColor: getComputedStyle(rankElement).color,
              suitColor: getComputedStyle(glyph).color,
              pathBox: {
                bottom: pathBox.y + pathBox.height,
                left: pathBox.x,
                right: pathBox.x + pathBox.width,
                top: pathBox.y,
              },
            };
          }),
        );

      expect(metrics).toHaveLength(cards.length);
      for (const metric of metrics) {
        expect(
          Math.abs(metric.rank.center - metric.cardCenter),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(metric.suit.center - metric.cardCenter),
        ).toBeLessThanOrEqual(1);
        expect(metric.suit.top - metric.rank.bottom).toBeGreaterThanOrEqual(4);
        expect(metric.rank.left).toBeGreaterThanOrEqual(metric.card.left);
        expect(metric.rank.right).toBeLessThanOrEqual(metric.card.right);
        expect(metric.suit.left).toBeGreaterThanOrEqual(metric.card.left);
        expect(metric.suit.right).toBeLessThanOrEqual(metric.card.right);
        expect(metric.pathBox.left).toBeGreaterThanOrEqual(0);
        expect(metric.pathBox.right).toBeLessThanOrEqual(100);
        expect(metric.pathBox.top).toBeGreaterThanOrEqual(0);
        expect(metric.pathBox.bottom).toBeLessThanOrEqual(100);
        expect(metric.pathBox.right - metric.pathBox.left).toBeGreaterThan(0);
        expect(metric.pathBox.bottom - metric.pathBox.top).toBeGreaterThan(0);
        if (metric.suitCode === "c") {
          // The accepted club is one continuous conventional silhouette. The
          // rejected three-circle construction rasterised as a pawn/tree on
          // Android-sized screens even though its bounding box was valid.
          expect(metric.clubPath.match(/M/g)).toHaveLength(1);
          expect(metric.clubPath.match(/Z/g)).toHaveLength(1);
          expect(metric.clubPath).not.toContain("a21 21");
          expect(metric.clubPath).toContain("A17.5 17.5");
          expect(metric.clubPath.endsWith("Z")).toBe(true);
          expect(metric.pathBox.left).toBeLessThan(20);
          expect(metric.pathBox.right).toBeGreaterThan(80);
          expect(metric.pathBox.top).toBeLessThan(30);
          expect(metric.pathBox.bottom).toBeGreaterThan(90);
        }
        if (cardStyle === "four-colour") {
          expect(metric.rankColor).toBe(metric.suitColor);
          expect(metric.suitColor).toBe(
            fourColour[metric.suitCode as keyof typeof fourColour],
          );
        }
      }

      const focusMetrics = await page
        .locator('[data-board-card][data-board-group="focus"]')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const card = element.getBoundingClientRect();
            const rank = element
              .querySelector(".card__rank")!
              .getBoundingClientRect();
            const suit = element
              .querySelector(".card__corner-suit")!
              .getBoundingClientRect();
            return {
              card,
              rank,
              suit,
            };
          }),
        );
      expect(focusMetrics).toHaveLength(focusCards.length);
      expect([
        ...new Set(focusCards.map((card) => card.slice(-1))),
      ]).toHaveLength(4);

      const smallestMetrics = await page
        .locator("[data-smallest-card]")
        .evaluateAll((elements) =>
          elements.map((element) => {
            const card = element.getBoundingClientRect();
            const rankElement = element.querySelector(".card__rank")!;
            const suitElement = element.querySelector(".card__corner-suit")!;
            const rank = rankElement.getBoundingClientRect();
            const suit = suitElement.getBoundingClientRect();
            return {
              card,
              groupCenter: (rank.top + suit.bottom) / 2,
              rank,
              rankFontSize: Number.parseFloat(
                getComputedStyle(rankElement).fontSize,
              ),
              suit,
              suitFontSize: Number.parseFloat(
                getComputedStyle(suitElement).fontSize,
              ),
            };
          }),
        );
      expect(smallestMetrics).toHaveLength(smallestCards.length);
      for (const metric of smallestMetrics) {
        expect(
          Math.abs(
            metric.rank.left +
              metric.rank.width / 2 -
              (metric.card.left + metric.card.width / 2),
          ),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(
            metric.suit.left +
              metric.suit.width / 2 -
              (metric.card.left + metric.card.width / 2),
          ),
        ).toBeLessThanOrEqual(1);
        expect(metric.suit.top - metric.rank.bottom).toBeGreaterThanOrEqual(2);
        expect(metric.rankFontSize).toBeGreaterThanOrEqual(20.5);
        expect(metric.suitFontSize).toBeGreaterThanOrEqual(18.5);
        expect(
          Math.abs(
            metric.groupCenter - (metric.card.top + metric.card.height / 2),
          ),
        ).toBeLessThanOrEqual(1.5);
      }

      for (const [index, metric] of metrics.entries()) {
        const next = metrics[index + 1];
        if (next && metric.card.top === next.card.top) {
          expect(metric.card.right).toBeLessThanOrEqual(next.card.left);
        }
      }

      const screenshotPath = testInfo.outputPath(
        `compact-community-cards-${viewport.width}-${cardStyle}.png`,
      );
      await page.screenshot({ fullPage: true, path: screenshotPath });
      await testInfo.attach(
        `compact-community-cards-${viewport.width}-${cardStyle}`,
        {
          contentType: "image/png",
          path: screenshotPath,
        },
      );
    }
  }
});
