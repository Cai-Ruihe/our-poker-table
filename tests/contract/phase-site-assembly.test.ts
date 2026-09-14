import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  lstat,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const roots: string[] = [];
const assemblerScript = path.join(
  process.cwd(),
  "tools",
  "release",
  "assemble-phase-site.mjs",
);
const buildVersion = "0.2.0-preview.1";
const phase1Revision = "phase1-fixture-revision";

interface FileRecord {
  path: string;
  sha256: string;
  size: number;
}

interface Fixture {
  root: string;
  archive: string;
  retainedRoot: string;
  retainedFiles: FileRecord[];
  multiplayerRoot: string;
  phase2Files: FileRecord[];
}

async function inventory(
  directory: string,
  prefix = "",
): Promise<FileRecord[]> {
  const files: FileRecord[] = [];
  for (const name of (await readdir(directory)).sort()) {
    const absolute = path.join(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    const stat = await lstat(absolute);
    if (stat.isDirectory())
      files.push(...(await inventory(absolute, relative)));
    else {
      const bytes = await readFile(absolute);
      files.push({
        path: relative,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.length,
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

async function fixture(
  options: { phase2Identity?: boolean } = {},
): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "poker-phase-site-assembly-"));
  roots.push(root);
  const retainedRoot = path.join(root, "retained-source");
  const multiplayerRoot = path.join(root, "dist", "multiplayer");
  const archive = path.join(root, "phase1.tar.gz");
  await Promise.all([
    mkdir(path.join(retainedRoot, "table-side"), { recursive: true }),
    mkdir(path.join(multiplayerRoot, "assets"), { recursive: true }),
    mkdir(path.join(root, "deploy"), { recursive: true }),
  ]);

  await Promise.all([
    writeFile(path.join(retainedRoot, "index.html"), "Phase 1 home\n"),
    writeFile(
      path.join(retainedRoot, "table-side", "index.html"),
      "Phase 1 table\n",
    ),
    writeFile(
      path.join(retainedRoot, "table-side", "poker-config.js"),
      "globalThis.__HTML_POKER_CONFIG__ ??= {};\n",
    ),
    writeFile(
      path.join(multiplayerRoot, "index.html"),
      '<script src="./assets/app.js"></script>\n',
    ),
    writeFile(
      path.join(multiplayerRoot, "poker-config.js"),
      "globalThis.__HTML_POKER_CONFIG__ ??= {};\n",
    ),
    writeFile(
      path.join(multiplayerRoot, "release-channel.json"),
      JSON.stringify({
        phase: options.phase2Identity ? "phase2" : "phase1",
        buildVersion: options.phase2Identity ? buildVersion : "1.0.0",
      }),
    ),
    writeFile(
      path.join(multiplayerRoot, "assets", "app.js"),
      options.phase2Identity
        ? `globalThis.phaseBuild = "${buildVersion}";\n`
        : `globalThis.phaseBuild = "phase1-default"; globalThis.staleVersion = "${buildVersion}";\n`,
    ),
  ]);

  await execute("tar", ["-czf", archive, "-C", retainedRoot, "."]);
  const [retainedFiles, phase2Files] = await Promise.all([
    inventory(retainedRoot),
    inventory(multiplayerRoot),
  ]);
  const archiveSha256 = createHash("sha256")
    .update(await readFile(archive))
    .digest("hex");
  await Promise.all([
    writeFile(
      path.join(root, "deploy", "phase-channels.json"),
      JSON.stringify({
        schemaVersion: 1,
        phase1: { sourceRevision: phase1Revision, archiveSha256 },
        phase2: { path: "multiplayer", buildVersion },
      }),
    ),
    writeFile(
      path.join(root, "deploy", "phase1-retained-files.json"),
      JSON.stringify({ sourceRevision: phase1Revision, files: retainedFiles }),
    ),
  ]);

  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["config", "user.name", "Contract Test"], { cwd: root });
  await execute(
    "git",
    ["config", "user.email", "contract-test@example.invalid"],
    {
      cwd: root,
    },
  );
  await execute("git", ["add", "-A"], { cwd: root });
  await execute("git", ["commit", "-qm", "fixture"], { cwd: root });

  return {
    root,
    archive,
    retainedRoot,
    retainedFiles,
    multiplayerRoot,
    phase2Files,
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("Phase site assembly", () => {
  it("omits AppleDouble archive metadata while preserving all retained content", async () => {
    const sample = await fixture({ phase2Identity: true });
    await writeFile(
      path.join(sample.retainedRoot, "table-side", "._index.html"),
      "metadata",
    );
    await execute("tar", [
      "-czf",
      sample.archive,
      "-C",
      sample.retainedRoot,
      ".",
    ]);
    const pinPath = path.join(sample.root, "deploy", "phase-channels.json");
    const pin = JSON.parse(await readFile(pinPath, "utf8"));
    pin.phase1.archiveSha256 = createHash("sha256")
      .update(await readFile(sample.archive))
      .digest("hex");
    await writeFile(pinPath, JSON.stringify(pin));
    await execute(process.execPath, [assemblerScript, sample.archive], {
      cwd: sample.root,
    });
    const retainedOutput = (
      await inventory(path.join(sample.root, "_site"))
    ).filter((file) => !file.path.startsWith("multiplayer/"));
    expect(retainedOutput).toEqual(sample.retainedFiles);
  });
  it("rejects duplicate inventory paths that conceal an omitted retained file", async () => {
    const sample = await fixture({ phase2Identity: true });
    const files = [...sample.retainedFiles];
    files[files.length - 1] = files[0]!;
    await writeFile(
      path.join(sample.root, "deploy/phase1-retained-files.json"),
      JSON.stringify({ sourceRevision: phase1Revision, files }),
    );
    await expect(
      execute(process.execPath, [assemblerScript, sample.archive], {
        cwd: sample.root,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("duplicate inventory path"),
    });
  });
  it("preserves the pinned Phase 1 files byte-for-byte beside a new Phase 2 bundle", async () => {
    const sample = await fixture({ phase2Identity: true });
    const result = await execute(
      process.execPath,
      [assemblerScript, sample.archive],
      {
        cwd: sample.root,
      },
    );
    const summary = JSON.parse(result.stdout) as {
      retainedFiles: number;
      phase2Files: number;
      sourceRevision: string;
    };

    expect(summary.retainedFiles).toBe(sample.retainedFiles.length);
    expect(summary.phase2Files).toBe(sample.phase2Files.length);
    for (const file of sample.retainedFiles) {
      const expected = await readFile(
        path.join(sample.retainedRoot, file.path),
      );
      await expect(
        readFile(path.join(sample.root, "_site", file.path)),
      ).resolves.toEqual(expected);
    }
    await expect(
      readFile(
        path.join(sample.root, "_site/multiplayer/assets/app.js"),
        "utf8",
      ),
    ).resolves.toContain(buildVersion);

    const manifest = JSON.parse(
      await readFile(
        path.join(sample.root, "_site/multiplayer/release-manifest.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      channel: "phase2-preview",
      buildVersion,
      preservedPhase1Revision: phase1Revision,
    });
    expect(manifest.files).toEqual(sample.phase2Files);
    expect(manifest.sourceRevision).toBe(summary.sourceRevision);
  });

  it("fails closed on a retained-file inventory mismatch without replacing the current site", async () => {
    const sample = await fixture({ phase2Identity: true });
    const inventoryPath = path.join(
      sample.root,
      "deploy",
      "phase1-retained-files.json",
    );
    const retainedInventory = JSON.parse(
      await readFile(inventoryPath, "utf8"),
    ) as {
      files: FileRecord[];
    };
    retainedInventory.files[0]!.sha256 = "0".repeat(64);
    await writeFile(inventoryPath, JSON.stringify(retainedInventory));
    await mkdir(path.join(sample.root, "_site"), { recursive: true });
    await writeFile(
      path.join(sample.root, "_site", "sentinel.txt"),
      "keep current site\n",
    );

    await expect(
      execute(process.execPath, [assemblerScript, sample.archive], {
        cwd: sample.root,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Retained Phase 1: digest mismatch"),
    });
    await expect(
      readFile(path.join(sample.root, "_site", "sentinel.txt"), "utf8"),
    ).resolves.toBe("keep current site\n");
  });

  it("rejects a Phase 1 default bundle even if it contains the Phase 2 version literal", async () => {
    const sample = await fixture({ phase2Identity: false });
    await mkdir(path.join(sample.root, "_site"), { recursive: true });
    await writeFile(
      path.join(sample.root, "_site", "sentinel.txt"),
      "keep current site\n",
    );

    await expect(
      execute(process.execPath, [assemblerScript, sample.archive], {
        cwd: sample.root,
      }),
    ).rejects.toBeDefined();
    await expect(
      readFile(path.join(sample.root, "_site", "sentinel.txt"), "utf8"),
    ).resolves.toBe("keep current site\n");
  });

  it("rejects a corrupted pinned archive before touching the current site", async () => {
    const sample = await fixture({ phase2Identity: true });
    await writeFile(
      sample.archive,
      Buffer.concat([await readFile(sample.archive), Buffer.from("corrupt")]),
    );
    await mkdir(path.join(sample.root, "_site"), { recursive: true });
    await writeFile(
      path.join(sample.root, "_site", "sentinel.txt"),
      "keep current site\n",
    );

    await expect(
      execute(process.execPath, [assemblerScript, sample.archive], {
        cwd: sample.root,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Retained archive digest mismatch"),
    });
    await expect(
      readFile(path.join(sample.root, "_site", "sentinel.txt"), "utf8"),
    ).resolves.toBe("keep current site\n");
  });
});
