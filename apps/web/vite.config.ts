import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const cardSetRoot = fileURLToPath(
  new URL("../../assets/skins/revk-card-sets", import.meta.url),
);

function tableSideCardFaceAssets(): Plugin {
  return {
    name: "table-side-card-face-assets",
    generateBundle() {
      for (const deck of ["classic", "four-colour"]) {
        const faceDirectory = resolve(cardSetRoot, deck, "faces");
        for (const fileName of readdirSync(faceDirectory)) {
          if (!fileName.endsWith(".svg")) continue;
          this.emitFile({
            fileName: `assets/skins/revk-card-sets/${deck}/faces/${fileName}`,
            source: readFileSync(resolve(faceDirectory, fileName)),
            type: "asset",
          });
        }
      }
    },
  };
}

export default defineConfig(() => {
  const airplaneBuild = process.env.HTML_POKER_AIRPLANE_BUILD === "1";
  return {
    base: "./",
    build: {
      emptyOutDir: true,
      outDir: process.env.HTML_POKER_OUTPUT_DIR ?? "../../dist/table-side",
      target: "baseline-widely-available",
    },
    define: {
      __HTML_POKER_AIRPLANE_BUILD__: JSON.stringify(airplaneBuild),
    },
    plugins: [react(), ...(airplaneBuild ? [] : [tableSideCardFaceAssets()])],
  };
});
