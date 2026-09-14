import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { createReleaseChannel } from "./src/release-channel";

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

function releaseChannelAsset(
  phase: "phase1" | "phase2",
  buildVersion: string,
): Plugin {
  return {
    name: "release-channel-asset",
    generateBundle() {
      this.emitFile({
        fileName: "release-channel.json",
        source: JSON.stringify({ buildVersion, phase }, null, 2) + "\n",
        type: "asset",
      });
    },
  };
}

export default defineConfig(() => {
  const airplaneBuild = process.env.HTML_POKER_AIRPLANE_BUILD === "1";
  const phase2Build = process.env.HTML_POKER_PHASE2_BUILD === "1";
  const releaseChannel = createReleaseChannel(
    phase2Build ? "phase2" : "phase1",
  );
  return {
    base: "./",
    build: {
      emptyOutDir: true,
      outDir:
        process.env.HTML_POKER_OUTPUT_DIR ??
        (phase2Build ? "../../dist/multiplayer" : "../../dist/table-side"),
      target: "baseline-widely-available",
    },
    define: {
      __HTML_POKER_AIRPLANE_BUILD__: JSON.stringify(airplaneBuild),
      __HTML_POKER_PHASE2_BUILD__: JSON.stringify(phase2Build),
    },
    plugins: [
      react(),
      releaseChannelAsset(releaseChannel.phase, releaseChannel.buildVersion),
      ...(airplaneBuild ? [] : [tableSideCardFaceAssets()]),
    ],
  };
});
