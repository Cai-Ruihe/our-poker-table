import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: 0,
    emptyOutDir: true,
    outDir: "../../dist/intro",
    target: "baseline-widely-available",
  },
});
