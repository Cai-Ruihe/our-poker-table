import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const skippedDirectories = new Set([
  ".git",
  "dist",
  "node_modules",
  "output",
  "playwright-report",
  "test-results",
]);
const checkedRoots = [
  ".github",
  "apps",
  "deploy",
  "docs",
  "packages",
  "services",
  "tests",
  "tools",
];
const forbiddenLegacyNames = [
  /\bNormal Mode\b/iu,
  /\bNormal Player\b/iu,
  /\bNormal Host\b/iu,
  /\bNORMAL_[A-Z_]+\b/u,
  /\bNORMAL-[A-Z0-9-]+\b/u,
  /(?:^|["'`(])\/?normal\//iu,
  /dist\/normal\b/iu,
  /deploy\/normal\b/iu,
  /build:normal\b/iu,
  /configure-normal\b/iu,
  /normal-(?:display|relay|service|tunnel)\b/iu,
  /data-runtime="normal"/iu,
  /cai-ruihe\.github\.io\/our-poker-table/iu,
];

async function textFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        files.push(...(await textFiles(path.join(directory, entry.name))));
      }
      continue;
    }
    if (entry.isFile()) files.push(path.join(directory, entry.name));
  }
  return files;
}

describe("Table-side naming contract", () => {
  it("removes legacy Normal Mode names from shipped source and release guidance", async () => {
    const files = (
      await Promise.all(
        checkedRoots.map((directory) => textFiles(path.join(root, directory))),
      )
    ).flat();
    const violations: string[] = [];

    for (const file of files) {
      if (file === new URL(import.meta.url).pathname) continue;
      const source = await readFile(file, "utf8");
      for (const pattern of forbiddenLegacyNames) {
        if (pattern.test(source)) {
          violations.push(`${path.relative(root, file)} matches ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
