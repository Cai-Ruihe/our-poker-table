import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function inventory(directory, prefix = "") {
  const files = [];
  for (const name of (await readdir(directory)).sort()) {
    const absolute = path.join(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink())
      throw new Error(`Symlink in release: ${relative}`);
    if (stat.isDirectory())
      files.push(...(await inventory(absolute, relative)));
    else if (stat.isFile()) {
      const bytes = await readFile(absolute);
      files.push({ path: relative, sha256: sha256(bytes), size: bytes.length });
    } else throw new Error(`Unsupported release entry: ${relative}`);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

function assertSameFiles(actual, expected, label) {
  const byPath = new Map(actual.map((file) => [file.path, file]));
  if (new Set(expected.map((file) => file.path)).size !== expected.length) {
    throw new Error(`${label}: duplicate inventory path`);
  }
  if (actual.length !== expected.length)
    throw new Error(`${label}: unexpected file count`);
  for (const file of expected) {
    const found = byPath.get(file.path);
    if (!found || found.sha256 !== file.sha256 || found.size !== file.size) {
      throw new Error(`${label}: digest mismatch for ${file.path}`);
    }
  }
}

export async function assemblePhaseSite(root, archive) {
  const pin = JSON.parse(
    await readFile(path.join(root, "deploy/phase-channels.json"), "utf8"),
  );
  const retained = JSON.parse(
    await readFile(
      path.join(root, "deploy/phase1-retained-files.json"),
      "utf8",
    ),
  );
  if (retained.sourceRevision !== pin.phase1.sourceRevision)
    throw new Error("Retained revision mismatch");
  if (sha256(await readFile(archive)) !== pin.phase1.archiveSha256)
    throw new Error("Retained archive digest mismatch");
  const temp = await mkdtemp(path.join(tmpdir(), "poker-phase-site-"));
  try {
    // BSD tar consumes AppleDouble metadata on macOS; GNU tar otherwise emits
    // it as extra ._ files. These are archive metadata, never website content.
    execFileSync("tar", ["--exclude=._*", "-xzf", archive, "-C", temp]);
    assertSameFiles(await inventory(temp), retained.files, "Retained Phase 1");
    if (retained.files.some((file) => file.path.startsWith("multiplayer/")))
      throw new Error("Retained site occupies Phase 2 path");
    const multiplayer = path.join(root, "dist/multiplayer");
    const phase2Files = await inventory(multiplayer);
    const channel = JSON.parse(
      await readFile(path.join(multiplayer, "release-channel.json"), "utf8"),
    );
    if (
      channel.phase !== "phase2" ||
      channel.buildVersion !== pin.phase2.buildVersion
    ) {
      throw new Error("Phase 2 build identity mismatch");
    }
    if (
      !phase2Files.some((file) => file.path === "index.html") ||
      !phase2Files.some((file) => file.path === "poker-config.js")
    )
      throw new Error("Configured Phase 2 artifact missing");
    const html = await readFile(path.join(multiplayer, "index.html"), "utf8");
    const scriptPaths = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
      (match) => match[1],
    );
    const scripts = await Promise.all(
      scriptPaths
        .filter((file) => file.startsWith("./assets/"))
        .map((file) => readFile(path.join(multiplayer, file), "utf8")),
    );
    if (!scripts.some((script) => script.includes(pin.phase2.buildVersion)))
      throw new Error(
        "Phase 2 build identity missing; refusing a default Phase 1 bundle",
      );
    const site = path.join(root, "_site");
    await rm(site, { recursive: true, force: true });
    await mkdir(site, { recursive: true });
    await cp(temp, site, { recursive: true });
    await cp(multiplayer, path.join(site, "multiplayer"), { recursive: true });
    assertSameFiles(
      await inventory(path.join(site, "multiplayer")),
      phase2Files,
      "Copied Phase 2",
    );
    const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const manifest = {
      schemaVersion: 1,
      channel: "phase2-preview",
      buildVersion: pin.phase2.buildVersion,
      sourceRevision,
      preservedPhase1Revision: pin.phase1.sourceRevision,
      preservedPhase1ArchiveSha256: pin.phase1.archiveSha256,
      files: phase2Files,
    };
    await writeFile(
      path.join(site, "multiplayer/release-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    const finalFiles = (await inventory(site)).filter(
      (file) => !file.path.startsWith("multiplayer/"),
    );
    assertSameFiles(finalFiles, retained.files, "Final retained Phase 1");
    return {
      retainedFiles: finalFiles.length,
      phase2Files: phase2Files.length,
      sourceRevision,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const archive = process.argv[2];
  if (!archive)
    throw new Error(
      "Usage: node tools/release/assemble-phase-site.mjs RETAINED_ARCHIVE",
    );
  console.log(
    JSON.stringify(
      await assemblePhaseSite(process.cwd(), path.resolve(archive)),
    ),
  );
}
