import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium } from "@playwright/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, "../public/product");

const chips = [
  {
    colour: "#242b2a",
    depth: "#111514",
    file: "hero-chip-black-stack.png",
    height: 146,
    offsets: [16, 12, 8, 4],
    shadow: { blur: 2.4, height: 7, opacity: 0.14, top: 137, width: 66 },
  },
  {
    colour: "#1e5a4c",
    depth: "#10382f",
    file: "hero-chip-green-stack.png",
    height: 142,
    offsets: [12, 8, 4],
    shadow: { blur: 2.4, height: 7, opacity: 0.14, top: 133, width: 66 },
  },
  {
    colour: "#b83239",
    depth: "#671b25",
    file: "hero-chip-red-stack.png",
    height: 140,
    offsets: [10, 5],
    shadow: { blur: 2.4, height: 7, opacity: 0.14, top: 131, width: 66 },
  },
  {
    colour: "#2e5b9d",
    depth: "#17345f",
    file: "hero-chip-blue.png",
    height: 136,
    offsets: [4],
    shadow: { blur: 2.4, height: 7, opacity: 0.14, top: 124.5, width: 66 },
  },
];

const chipFaceCss = `
  .face {
    z-index: 1;
    border-color: rgba(246, 239, 224, 0.76);
    background:
      radial-gradient(circle at 50% 12%, var(--chip-inlay) 0 2.4%, transparent 2.8%),
      radial-gradient(circle at 78% 22%, var(--chip-inlay) 0 2.4%, transparent 2.8%),
      radial-gradient(circle at 88% 50%, var(--chip-inlay) 0 2.4%, transparent 2.8%),
      radial-gradient(circle at 78% 78%, var(--chip-inlay) 0 2.4%, transparent 2.8%),
      radial-gradient(circle at 50% 88%, var(--chip-inlay) 0 2.4%, transparent 2.8%),
      radial-gradient(circle at 22% 78%, var(--chip-inlay) 0 2.4%, transparent 2.8%),
      radial-gradient(circle at 12% 50%, var(--chip-inlay) 0 2.4%, transparent 2.8%),
      radial-gradient(circle at 22% 22%, var(--chip-inlay) 0 2.4%, transparent 2.8%),
      radial-gradient(
        circle,
        var(--chip-colour) 0 39%,
        rgba(246, 239, 224, 0.88) 40% 42%,
        var(--chip-colour) 43% 47%,
        transparent 48%
      ),
      repeating-conic-gradient(
        from 7deg,
        transparent 0deg 11deg,
        rgba(246, 239, 224, 0.86) 11deg 16deg,
        transparent 16deg 45deg
      ),
      repeating-conic-gradient(
        from 0deg,
        var(--chip-colour) 0deg 20deg,
        var(--chip-inlay) 20deg 34deg,
        var(--chip-colour) 34deg 45deg
      );
    box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.16);
  }

  .face::after {
    position: absolute;
    inset: 32%;
    border: 1px solid rgba(0, 20, 16, 0.34);
    border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(246, 239, 224, 0.2);
    content: "";
  }
`;

const browser = await chromium.launch({ headless: true });

try {
  await mkdir(outputDirectory, { recursive: true });

  for (const chip of chips) {
    const page = await browser.newPage({
      deviceScaleFactor: 2,
      viewport: { height: chip.height, width: 128 },
    });
    const sideLayers = chip.offsets
      .map(
        (offset, index) =>
          `<i class="disc side" style="--phase:${[0, 6, 3, 9][chip.offsets.length - 1 - index] ?? 0}px; transform:translateY(${offset}px)"></i>`,
      )
      .join("");
    const shadowLeft = (128 - chip.shadow.width) / 2;

    await page.setContent(`<!doctype html>
      <html>
        <head>
          <style>
            * { box-sizing: border-box; }
            html, body { width: 128px; height: ${chip.height}px; margin: 0; overflow: hidden; background: transparent; }
            .canvas { position: relative; width: 128px; height: ${chip.height}px; overflow: hidden; }
            .shadow {
              position: absolute;
              top: ${chip.shadow.top}px;
              left: ${shadowLeft}px;
              width: ${chip.shadow.width}px;
              height: ${chip.shadow.height}px;
              border-radius: 50%;
              background: rgba(0, 26, 21, ${chip.shadow.opacity});
              filter: blur(${chip.shadow.blur}px);
            }
            .art {
              --chip-colour: ${chip.colour};
              --chip-depth: ${chip.depth};
              --chip-inlay: #f6efe0;
              position: absolute;
              top: 6px;
              left: 6px;
              width: 116px;
              height: 116px;
            }
            .disc {
              position: absolute;
              inset: 0;
              border: 1px solid rgba(0, 20, 16, 0.32);
              border-radius: 50%;
            }
            .side {
              z-index: 0;
              background:
                repeating-linear-gradient(
                    90deg,
                    transparent 0 10%,
                    rgba(246, 239, 224, 0.88) 10% 18%,
                    transparent 18% 34%
                  )
                  var(--phase) 0 / 100% 100%,
                linear-gradient(to bottom, var(--chip-colour), var(--chip-depth));
              box-shadow: inset 0 -1.3px 0 rgba(0, 0, 0, 0.16);
            }
            ${chipFaceCss}
          </style>
        </head>
        <body>
          <div class="canvas">
            <div class="shadow"></div>
            <div class="art">${sideLayers}<i class="disc face"></i></div>
          </div>
        </body>
      </html>`);

    await page.locator(".canvas").screenshot({
      omitBackground: true,
      path: path.join(outputDirectory, chip.file),
    });
    await page.close();
  }
} finally {
  await browser.close();
}
