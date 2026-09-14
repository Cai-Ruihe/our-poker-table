import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "_site/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-globals": ["error", "event"],
    },
  },
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@html-poker/*/src", "@html-poker/*/src/**"],
              message:
                "Import another workspace package through its public export.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "packages/card-custody/src/**/*.ts",
      "packages/game-core/src/**/*.ts",
      "packages/persistence/src/**/*.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        "document",
        "event",
        "localStorage",
        "navigator",
        "sessionStorage",
        "window",
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: ["react", "react-dom"],
          patterns: [
            {
              group: ["@html-poker/*/src", "@html-poker/*/src/**"],
              message:
                "Import another workspace package through its public export.",
            },
            {
              group: ["react/*", "react-dom/*"],
              message:
                "Authority and persistence packages must remain React-free.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "packages/card-custody/src/**/*.ts",
      "packages/game-core/src/**/*.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        "document",
        "event",
        "fetch",
        "indexedDB",
        "localStorage",
        "navigator",
        "sessionStorage",
        "WebSocket",
        "window",
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "globalThis",
          property: "fetch",
          message: "Card Custody and Game Core must not perform network I/O.",
        },
        {
          object: "globalThis",
          property: "indexedDB",
          message:
            "Card Custody and Game Core must use the persistence boundary.",
        },
      ],
    },
  },
);
