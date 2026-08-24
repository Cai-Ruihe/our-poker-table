import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { parse as parseYaml } from "yaml";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const registry = parseYaml(
  await readFile(path.join(root, "docs/quality/qa-registry.yaml"), "utf8"),
);
const contract = registry.control_contract;
const failures = [];
const sourceControls = new Map();
const sourceControlBuilds = new Map();

function mutuallyExclusiveBuild(node, sourceFile) {
  let current = node;
  while (current.parent) {
    const annotation = /@qa-build\s+(normal|airplane)/u.exec(
      sourceFile.text.slice(
        current.getFullStart(),
        current.getStart(sourceFile),
      ),
    );
    if (annotation?.[1]) return annotation[1];
    const parent = current.parent;
    if (
      ts.isConditionalExpression(parent) &&
      parent.condition.getText(sourceFile) === "props.airplaneMode"
    ) {
      return current.getStart(sourceFile) >=
        parent.whenTrue.getStart(sourceFile) &&
        current.getEnd() <= parent.whenTrue.getEnd()
        ? "airplane"
        : "normal";
    }
    current = parent;
  }
  return undefined;
}

function attribute(node, name) {
  return node.attributes.properties.find(
    (candidate) =>
      ts.isJsxAttribute(candidate) && candidate.name.getText() === name,
  );
}

function literalAttribute(node, name) {
  const candidate = attribute(node, name);
  if (!candidate?.initializer || !ts.isStringLiteral(candidate.initializer)) {
    return undefined;
  }
  return candidate.initializer.text;
}

function expressionAttribute(node, name) {
  const candidate = attribute(node, name);
  if (
    !candidate?.initializer ||
    !ts.isJsxExpression(candidate.initializer) ||
    !candidate.initializer.expression
  ) {
    return undefined;
  }
  return candidate.initializer.expression.getText();
}

function isInteractive(node, sourceFile) {
  const tag = node.tagName.getText(sourceFile);
  const role = literalAttribute(node, "role");
  if (role === "button" || role === "slider") return true;
  if (tag === "button" || tag === "select" || tag === "ActionButton") {
    return true;
  }
  if (tag !== "input") return false;
  return ["button", "checkbox", "file", "radio", "range", "submit"].includes(
    literalAttribute(node, "type") ?? "text",
  );
}

for (const relativePath of contract?.sources ?? []) {
  const absolutePath = path.join(root, relativePath);
  const source = await readFile(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      isInteractive(node, sourceFile)
    ) {
      const tag = node.tagName.getText(sourceFile);
      const attributeName =
        tag === "ActionButton" ? "qaControl" : "data-qa-control";
      const id = literalAttribute(node, attributeName);
      const forwarded = expressionAttribute(node, attributeName);
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const build = mutuallyExclusiveBuild(node, sourceFile);

      // The shared ActionButton renderer forwards its call-site ID. Every
      // concrete ActionButton call site is still inventoried separately.
      if (tag === "button" && forwarded === "qaControl") {
        ts.forEachChild(node, visit);
        return;
      }
      if (!id) {
        failures.push(
          `${relativePath}:${line} ${tag} is missing a literal ${attributeName}`,
        );
      } else if (sourceControls.has(id)) {
        const existingBuild = sourceControlBuilds.get(id);
        if (!existingBuild || !build || existingBuild === build) {
          failures.push(
            `${relativePath}:${line} duplicates control ID ${id} from ${sourceControls.get(id)}`,
          );
        }
      } else {
        sourceControls.set(id, `${relativePath}:${line}`);
        if (build) sourceControlBuilds.set(id, build);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const registered = new Map(Object.entries(contract?.controls ?? {}));
for (const [id, location] of sourceControls) {
  if (!registered.has(id)) {
    failures.push(`${location} control ${id} is absent from control_contract`);
  }
}
for (const [id, details] of registered) {
  if (!sourceControls.has(id)) {
    failures.push(`registered control ${id} is absent from product source`);
  }
  if (!details?.surface || !details?.expected_result) {
    failures.push(`registered control ${id} lacks surface or expected_result`);
  }
  const evidence = details?.evidence;
  const evidenceFiles = Array.isArray(evidence)
    ? evidence
    : [evidence].filter(Boolean);
  if (evidenceFiles.length === 0) {
    failures.push(`registered control ${id} has no browser evidence`);
    continue;
  }
  const evidenceTexts = [];
  for (const evidenceFile of evidenceFiles) {
    const evidenceText = await readFile(
      path.join(root, evidenceFile),
      "utf8",
    ).catch(() => undefined);
    if (!evidenceText) {
      failures.push(
        `registered control ${id} evidence is missing: ${evidenceFile}`,
      );
      continue;
    }
    evidenceTexts.push(evidenceText);
  }
  const combinedEvidence = evidenceTexts.join("\n");
  const variants = details?.variants ?? [];
  if (variants.length > 0) {
    for (const variant of variants) {
      const markerPattern = new RegExp(
        `exerciseControlVariant\\s*\\(\\s*["']${id}["']\\s*,\\s*["']${variant}["']`,
        "u",
      );
      if (!markerPattern.test(combinedEvidence)) {
        failures.push(
          `registered control ${id} variant ${variant} has no exercised browser outcome`,
        );
      }
    }
  } else {
    const marker = contract.evidence_marker ?? "exerciseControl";
    const markerPattern = new RegExp(`${marker}\\s*\\(\\s*["']${id}["']`, "u");
    if (!markerPattern.test(combinedEvidence)) {
      failures.push(
        `registered control ${id} is not invoked through ${marker}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`Control QA failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Control QA passed: ${sourceControls.size} source controls have registered browser outcomes.`,
  );
}
