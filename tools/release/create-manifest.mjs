import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(import.meta.url);
const manifestRelativePath = "dist/release/phase-1-manifest.json";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(target)));
    if (entry.isFile()) files.push(target);
  }
  return files;
}

async function collectArtifact(root, name, directory) {
  if (!existsSync(directory)) {
    throw new Error(
      `Release artifact is missing: ${path.relative(root, directory)}`,
    );
  }
  const files = await collectFiles(directory);
  if (files.length === 0) {
    throw new Error(
      `Release artifact is empty: ${path.relative(root, directory)}`,
    );
  }
  return {
    files: await Promise.all(
      files.map(async (file) => {
        const bytes = await readFile(file);
        return {
          path: path.relative(root, file).split(path.sep).join("/"),
          sha256: digest(bytes),
          size: bytes.byteLength,
        };
      }),
    ),
    name,
  };
}

async function git(root, args) {
  const { stdout } = await execFile("git", args, { cwd: root });
  return stdout.trim();
}

async function sourceRevision(root) {
  try {
    return await git(root, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    throw new Error(
      "A committed Git revision is required for a release manifest.",
    );
  }
}

async function assertCleanWorktree(root) {
  const status = await git(root, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (status) {
    throw new Error(
      "Release manifests require a clean worktree. Commit or intentionally discard the listed changes first.",
    );
  }
}

function releaseVersions(runtimeSource) {
  const buildVersion = /BUILD_VERSION\s*=\s*"([^"]+)"/u.exec(
    runtimeSource,
  )?.[1];
  const protocolVersion = /PROTOCOL_VERSION\s*=\s*(\d+)/u.exec(
    runtimeSource,
  )?.[1];
  if (!buildVersion || !protocolVersion) {
    throw new Error("The Phase 1 build or protocol version could not be read.");
  }
  return { buildVersion, protocolVersion: Number(protocolVersion) };
}

export async function collectReleaseManifest(root = process.cwd()) {
  const [packageJson, runtimeSource, lockfile, revision] = await Promise.all([
    readFile(path.join(root, "package.json"), "utf8"),
    readFile(path.join(root, "apps/web/src/runtime.ts"), "utf8"),
    readFile(path.join(root, "pnpm-lock.yaml")),
    sourceRevision(root),
  ]);
  const packageMetadata = JSON.parse(packageJson);
  const [tableSide, airplane] = await Promise.all([
    collectArtifact(root, "table-side", path.join(root, "dist/table-side")),
    collectArtifact(root, "airplane", path.join(root, "dist/airplane")),
  ]);
  return {
    artifacts: [tableSide, airplane],
    build: {
      node: process.version,
      packageManager: packageMetadata.packageManager,
      ...releaseVersions(runtimeSource),
    },
    lockfileSha256: digest(lockfile),
    schemaVersion: 1,
    sourceRevision: revision,
  };
}

async function main() {
  const root = process.cwd();
  const verify = process.argv.includes("--verify");
  const manifestPath = path.join(root, manifestRelativePath);
  if (verify) {
    if (!existsSync(manifestPath)) {
      throw new Error(`Release manifest is missing: ${manifestRelativePath}`);
    }
    const [expected, actual] = await Promise.all([
      readFile(manifestPath, "utf8").then((value) => JSON.parse(value)),
      collectReleaseManifest(root),
    ]);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error(
        "Release manifest does not match the current artifacts or source revision.",
      );
    }
    process.stdout.write(`Verified ${manifestRelativePath}\n`);
    return;
  }
  await assertCleanWorktree(root);
  const manifest = await collectReleaseManifest(root);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`Wrote ${manifestRelativePath}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await main();
}
