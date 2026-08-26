import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const registryPath = path.join(root, "docs/quality/qa-registry.yaml");
const registry = parseYaml(await readFile(registryPath, "utf8"));
const failures = [];

function relativeExists(relativePath) {
  return existsSync(path.join(root, relativePath));
}

function extractSectionItems(markdown, heading) {
  const marker = `## ${heading}\n`;
  const start = markdown.indexOf(marker);
  if (start < 0) return [];
  const remainder = markdown.slice(start + marker.length);
  const nextHeading = remainder.search(/^## /mu);
  const section = nextHeading < 0 ? remainder : remainder.slice(0, nextHeading);
  const listed = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:\d+\.|- )/u.test(line));
  if (listed.length > 0) return listed;
  const prose = section.replace(/\s+/gu, " ").trim();
  return prose ? [prose] : [];
}

function uniqueMatches(markdown, pattern) {
  const expression = new RegExp(pattern, "gmu");
  const values = [];
  for (const match of markdown.matchAll(expression)) {
    const value = match[1] ?? match[0];
    if (value && value !== "ID") values.push(value);
  }
  return [...new Set(values)].sort();
}

const manifest = parseYaml(
  await readFile(path.join(root, "docs/prd/manifest.yaml"), "utf8"),
);
const expectedImports = new Map([
  ["master", "docs/prd/MASTER-PRD.md"],
  ...Object.entries(manifest.phases ?? {}).map(([id, details]) => [
    id,
    `docs/prd/${details.file}`,
  ]),
  ...Object.entries(manifest.modules ?? {}).map(([id, details]) => [
    id,
    `docs/prd/${details.file}`,
  ]),
]);

const requirementInventory = [];
for (const [key, expectedFile] of expectedImports) {
  const imported = registry.requirement_imports?.[key];
  if (!imported) {
    failures.push(`missing requirement import ${key}`);
    continue;
  }
  if (imported.file !== expectedFile) {
    failures.push(
      `${key} imports ${imported.file}; PRD manifest requires ${expectedFile}`,
    );
  }
  if (!relativeExists(imported.file)) {
    failures.push(`${key} source does not exist: ${imported.file}`);
    continue;
  }
  if (!["active", "tracer", "deferred"].includes(imported.lifecycle)) {
    failures.push(`${key} has invalid lifecycle ${imported.lifecycle}`);
  }
  if (!Array.isArray(imported.evidence) || imported.evidence.length === 0) {
    failures.push(`${key} has no evidence route`);
  } else {
    for (const evidence of imported.evidence) {
      if (!relativeExists(evidence)) {
        failures.push(`${key} evidence does not exist: ${evidence}`);
      }
    }
  }
  const markdown = await readFile(path.join(root, imported.file), "utf8");
  const stories = extractSectionItems(markdown, "User Stories");
  const testing = extractSectionItems(markdown, "Testing Decisions");
  if (stories.length === 0) failures.push(`${key} imports no User Stories`);
  if (testing.length === 0)
    failures.push(`${key} imports no Testing Decisions`);
  stories.forEach((text, index) =>
    requirementInventory.push({
      evidence: imported.evidence,
      id: `${key}-US-${String(index + 1).padStart(3, "0")}`,
      lifecycle: imported.lifecycle,
      source: imported.file,
      text,
    }),
  );
  testing.forEach((text, index) =>
    requirementInventory.push({
      evidence: imported.evidence,
      id: `${key}-TEST-${String(index + 1).padStart(3, "0")}`,
      lifecycle: imported.lifecycle,
      source: imported.file,
      text,
    }),
  );
}

for (const key of Object.keys(registry.requirement_imports ?? {})) {
  if (!expectedImports.has(key))
    failures.push(`unknown requirement import ${key}`);
}

const stableInventory = [];
for (const [key, source] of Object.entries(registry.stable_id_sources ?? {})) {
  if (!relativeExists(source.file)) {
    failures.push(`${key} stable-ID source does not exist: ${source.file}`);
    continue;
  }
  if (!relativeExists(source.evidence)) {
    failures.push(`${key} evidence does not exist: ${source.evidence}`);
  }
  const markdown = await readFile(path.join(root, source.file), "utf8");
  const ids = uniqueMatches(markdown, source.pattern);
  if (ids.length === 0) failures.push(`${key} imported zero stable IDs`);
  ids.forEach((id) =>
    stableInventory.push({
      evidence: source.evidence,
      id,
      source: source.file,
    }),
  );
}

const duplicateStableIds = stableInventory
  .map((item) => item.id)
  .filter((id, index, all) => all.indexOf(id) !== index);
if (duplicateStableIds.length > 0) {
  failures.push(
    `stable IDs imported more than once: ${[...new Set(duplicateStableIds)].join(", ")}`,
  );
}

const liveRelay = registry.live_relay_contract;
for (const field of ["checker", "test", "workflow"]) {
  const relativePath = liveRelay?.[field];
  if (!relativePath || !relativeExists(relativePath)) {
    failures.push(`live relay ${field} is missing: ${relativePath ?? "unset"}`);
  }
}
const rootPackage = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
if (!rootPackage.scripts?.[liveRelay?.package_script]) {
  failures.push(
    `live relay package script is missing: ${liveRelay?.package_script ?? "unset"}`,
  );
}
if (liveRelay?.command !== `pnpm ${liveRelay?.package_script}`) {
  failures.push("live relay command does not match its package script");
}
if (liveRelay?.workflow && relativeExists(liveRelay.workflow)) {
  const workflow = await readFile(path.join(root, liveRelay.workflow), "utf8");
  for (const requiredFragment of [
    "Verify configured live relay",
    liveRelay.command,
    "TABLE_SIDE_APP_ORIGIN: ${{ vars.TABLE_SIDE_APP_ORIGIN || format('https://{0}.github.io', github.repository_owner) }}",
    "if: vars.TABLE_SIDE_CLOUD_RELAY_URL != '' || vars.TABLE_SIDE_MAC_RELAY_URL != '' || vars.TABLE_SIDE_CONNECTION_SERVICE_URL != ''",
  ]) {
    if (!workflow.includes(requiredFragment)) {
      failures.push(`live relay workflow is missing: ${requiredFragment}`);
    }
  }
}
if (liveRelay?.checker && relativeExists(liveRelay.checker)) {
  const checker = await readFile(path.join(root, liveRelay.checker), "utf8");
  for (const requiredCheck of liveRelay.required_checks ?? []) {
    const evidenceFragment =
      {
        dns: "does not resolve in DNS",
        health: "GET /health",
        "exact-origin-cors": "CORS allows",
        "invalid-token-rejection": "invalid operator token",
      }[requiredCheck] ?? requiredCheck;
    if (!checker.includes(evidenceFragment)) {
      failures.push(`live relay checker has no ${requiredCheck} evidence`);
    }
  }
  if (!checker.includes("operatorTokenAcceptance")) {
    failures.push("live relay checker has no owner-token acceptance evidence");
  }
}

const selfHosting = registry.self_hosting_contract;
for (const field of [
  "guide",
  "compose",
  "environment_template",
  "dockerfile",
  "token_tool",
  "test",
  "configuration_test",
]) {
  const relativePath = selfHosting?.[field];
  if (!relativePath || !relativeExists(relativePath)) {
    failures.push(
      `self-hosting ${field} is missing: ${relativePath ?? "unset"}`,
    );
  }
}
for (const field of ["token_script", "doctor_script"]) {
  const script = selfHosting?.[field];
  if (!script || !rootPackage.scripts?.[script]) {
    failures.push(
      `self-hosting package script is missing: ${script ?? "unset"}`,
    );
  }
}
if (selfHosting?.ownership !== "deployer") {
  failures.push("self-hosting ownership must remain deployer-owned");
}
if (selfHosting?.unconfigured_behavior !== "no-relay") {
  failures.push("an unconfigured fork must contain no relay fallback");
}
if (selfHosting?.compose && relativeExists(selfHosting.compose)) {
  const compose = await readFile(path.join(root, selfHosting.compose), "utf8");
  for (const requiredFragment of [
    "127.0.0.1:${POKER_CONNECTION_PORT:-8787}:8787",
    "POKER_CONNECTION_ACCESS_TOKEN_FILE: /run/secrets/operator_token",
    "POKER_CONNECTION_ALLOWED_ORIGIN: ${TABLE_SIDE_APP_ORIGIN:?required}",
    "RELAY_OPERATOR_TOKEN_FILE:?required",
  ]) {
    if (!compose.includes(requiredFragment)) {
      failures.push(
        `self-hosting Compose recipe is missing: ${requiredFragment}`,
      );
    }
  }
  if (/cai-ruihe|trycloudflare\.com/iu.test(compose)) {
    failures.push("self-hosting Compose recipe contains an owner endpoint");
  }
}
if (selfHosting?.guide && relativeExists(selfHosting.guide)) {
  const guide = await readFile(path.join(root, selfHosting.guide), "utf8");
  for (const requiredFragment of [
    "pnpm relay:create-token",
    "pnpm relay:doctor",
    "TABLE_SIDE_CLOUD_RELAY_URL",
    "TABLE_SIDE_MAC_RELAY_URL",
    "TABLE_SIDE_CONNECTION_SERVICE_URL",
    "table-side/poker-config.js",
    "## Troubleshooting guide",
    "does **not** fall back to the project owner's relay",
  ]) {
    if (!guide.includes(requiredFragment)) {
      failures.push(`self-hosting guide is missing: ${requiredFragment}`);
    }
  }
}

const visual = registry.visual_contract;
for (const requiredState of [
  "quiet",
  "lower-quick",
  "upper-quick",
  "fullscreen-quick",
  "showdown",
  "secondary",
  "manage-players",
]) {
  if (!visual?.tablet_states?.includes(requiredState)) {
    failures.push(`visual contract is missing Tablet state ${requiredState}`);
  }
}
if (visual?.fullscreen?.applies_to !== "tablet-page-fullscreen-only") {
  failures.push(
    "fullscreen visual contract must be scoped to Tablet page fullscreen",
  );
}
if (visual?.fullscreen?.protected_launcher_corner !== "upper-left") {
  failures.push(
    "fullscreen visual contract must declare the protected upper-left launcher",
  );
}
if (visual?.fullscreen?.panel_edge_flush !== true) {
  failures.push("fullscreen visual contract must keep panels edge-flush");
}
if (visual?.showdown?.preserve_quiet_board_geometry !== true) {
  failures.push("showdown visual contract must preserve quiet board geometry");
}
if (visual?.showdown?.explanation !== "directly-below-board") {
  failures.push(
    "showdown visual contract must place the explanation below the board",
  );
}

const visualBaselines = registry.visual_baselines;
for (const platform of ["darwin", "linux"]) {
  if (!visualBaselines?.platforms?.includes(platform)) {
    failures.push(`visual baselines are missing platform ${platform}`);
  }
}
if (visualBaselines?.project !== "chromium") {
  failures.push(
    "visual baselines must declare the deterministic chromium project",
  );
}
const failureEvidence = visualBaselines?.ci_failure_evidence;
if (!failureEvidence?.workflow || !relativeExists(failureEvidence.workflow)) {
  failures.push("visual failure-evidence workflow is missing");
} else {
  const workflow = await readFile(
    path.join(root, failureEvidence.workflow),
    "utf8",
  );
  for (const requiredFragment of [
    "if: failure()",
    "actions/upload-artifact@",
    ...(failureEvidence.required_paths ?? []),
  ]) {
    if (!workflow.includes(requiredFragment)) {
      failures.push(
        `CI does not preserve required visual failure evidence: ${requiredFragment}`,
      );
    }
  }
  if (
    !Number.isSafeInteger(failureEvidence.retention_days) ||
    failureEvidence.retention_days < 7
  ) {
    failures.push("visual failure-evidence retention must be at least 7 days");
  }
  if (!workflow.includes(`retention-days: ${failureEvidence.retention_days}`)) {
    failures.push("CI visual failure-evidence retention differs from registry");
  }
}
for (const baseline of visualBaselines?.required ?? []) {
  if (!relativeExists(baseline.test)) {
    failures.push(`visual baseline test is missing: ${baseline.test}`);
    continue;
  }
  const testSource = await readFile(path.join(root, baseline.test), "utf8");
  if (!testSource.includes(`"${baseline.name}"`)) {
    failures.push(
      `visual baseline has no screenshot assertion: ${baseline.name}`,
    );
  }
  for (const platform of visualBaselines.platforms ?? []) {
    const image = `${baseline.test}-snapshots/${baseline.name}-${platform}-${visualBaselines.project}.png`;
    if (!relativeExists(image)) {
      failures.push(`reviewed visual baseline is missing: ${image}`);
    }
  }
}

// A reviewed snapshot is evidence only while its owning spec still names the
// screenshot. This filesystem-to-test check prevents deleted/replaced visual
// scenarios from lingering as apparently current QA evidence and later being
// swept into human-review contact sheets.
const journeyDirectory = path.join(root, "tests/journey");
for (const directoryEntry of await readdir(journeyDirectory, {
  withFileTypes: true,
})) {
  if (
    !directoryEntry.isDirectory() ||
    !directoryEntry.name.endsWith("-snapshots")
  ) {
    continue;
  }
  const specName = directoryEntry.name.replace(/-snapshots$/u, "");
  const specPath = path.join(journeyDirectory, specName);
  if (!existsSync(specPath)) {
    failures.push(
      `visual snapshot directory has no owning spec: tests/journey/${directoryEntry.name}`,
    );
    continue;
  }
  const specSource = await readFile(specPath, "utf8");
  const snapshotDirectory = path.join(journeyDirectory, directoryEntry.name);
  for (const snapshotEntry of await readdir(snapshotDirectory, {
    withFileTypes: true,
  })) {
    if (!snapshotEntry.isFile() || !snapshotEntry.name.endsWith(".png")) {
      continue;
    }
    const screenshotName = snapshotEntry.name.replace(
      /-(?:darwin|linux)-(?:chromium|mobile-webkit)\.png$/u,
      "",
    );
    if (!specSource.includes(`"${screenshotName}"`)) {
      failures.push(
        `orphaned visual snapshot is not named by its owning spec: tests/journey/${directoryEntry.name}/${snapshotEntry.name}`,
      );
    }
  }
}
for (const requiredTheme of ["dark-green", "black-gold", "deep-navy"]) {
  if (!visual?.themes?.includes(requiredTheme)) {
    failures.push(`visual contract is missing theme ${requiredTheme}`);
  }
}
for (const requiredGeometry of [
  "quick_panel",
  "utility_target",
  "utility_gap",
  "action_gap",
  "next_card",
  "next_hand",
  "slider_track",
  "slider_handle",
  "slider_travel",
  "slider_radius",
  "gold_thread",
]) {
  if (!visual?.geometry?.[requiredGeometry]) {
    failures.push(`visual contract is missing geometry ${requiredGeometry}`);
  }
}
if (!relativeExists(registry.manual_evidence?.file ?? "")) {
  failures.push(
    `manual evidence protocol is missing: ${registry.manual_evidence?.file}`,
  );
}

const tabletActions = registry.tablet_secondary_actions;
if (!relativeExists(tabletActions?.source ?? "")) {
  failures.push(
    `Tablet secondary-action source is missing: ${tabletActions?.source}`,
  );
} else {
  const source = await readFile(path.join(root, tabletActions.source), "utf8");
  const evidenceFiles = tabletActions.evidence ?? [];
  const evidenceText = (
    await Promise.all(
      evidenceFiles.map(async (file) => {
        if (!relativeExists(file)) {
          failures.push(`Tablet action evidence is missing: ${file}`);
          return "";
        }
        return readFile(path.join(root, file), "utf8");
      }),
    )
  ).join("\n");
  const requiredActions = tabletActions.required ?? [];
  if (new Set(requiredActions).size !== requiredActions.length) {
    failures.push("Tablet secondary-action IDs are not unique");
  }
  for (const actionId of requiredActions) {
    if (!source.includes(`"${actionId}"`)) {
      failures.push(`Tablet secondary action is absent from UI: ${actionId}`);
    }
    if (!evidenceText.includes(`"${actionId}"`)) {
      failures.push(`Tablet secondary action has no invoked test: ${actionId}`);
    }
  }
}

const requiredCommands = new Set([
  "pnpm qa:registry",
  "pnpm check",
  "pnpm test:coverage",
  "pnpm qa:browser",
  "pnpm audit:prod",
]);
for (const command of requiredCommands) {
  if (!registry.release_blocking_commands?.includes(command)) {
    failures.push(`release-blocking command is missing: ${command}`);
  }
}

for (const budget of [
  "table_side_javascript_raw_bytes",
  "table_side_javascript_gzip_bytes",
  "table_side_css_raw_bytes",
  "airplane_html_raw_bytes",
]) {
  const value = registry.performance_contract?.artifacts?.[budget];
  if (!Number.isSafeInteger(value) || value <= 0) {
    failures.push(`performance budget is missing or invalid: ${budget}`);
  }
}
if (
  !Number.isSafeInteger(
    registry.performance_contract?.browser_interaction_timeout_ms,
  )
) {
  failures.push("browser interaction timeout is missing or invalid");
}

const outputDirectory = path.join(root, "test-results/qa");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "requirements-inventory.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      requirements: requirementInventory,
      stableIds: stableInventory,
    },
    null,
    2,
  )}\n`,
);

if (failures.length > 0) {
  console.error(`QA registry failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `QA registry passed: ${requirementInventory.length} imported PRD requirements, ${stableInventory.length} stable decisions/feedback IDs, ${expectedImports.size} authoritative PRD documents.`,
  );
}
