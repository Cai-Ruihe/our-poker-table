import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      // Keep the operator credential in the local Miniflare test runtime. It
      // is intentionally not added to wrangler.toml or any deploy config.
      miniflare: {
        bindings: {
          RELAY_OPERATOR_TOKEN: "local-integration-operator-token",
        },
      },
    }),
  ],
  root: new URL(".", import.meta.url).pathname,
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
