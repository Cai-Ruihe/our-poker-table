import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

const root = process.cwd();
const registry = parseYaml(
  await readFile(path.join(root, "docs/quality/qa-registry.yaml"), "utf8"),
);
const budgets = registry.performance_contract?.artifacts;
if (!budgets) throw new Error("QA performance artifact budgets are missing.");

async function artifactFiles(directory, extension) {
  const entries = await readdir(path.join(root, directory), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(root, directory, entry.name));
}

async function artifactSet(directory, extension) {
  const files = await artifactFiles(directory, extension);
  if (files.length === 0) {
    throw new Error(`No ${extension} artifact exists under ${directory}.`);
  }
  return Promise.all(files.map((file) => readFile(file)));
}

function assertBudget(label, actual, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum <= 0) {
    throw new Error(`${label} has no valid budget.`);
  }
  if (actual > maximum) {
    throw new Error(`${label} is ${actual} bytes; budget is ${maximum} bytes.`);
  }
  process.stdout.write(`${label}: ${actual}/${maximum} bytes\n`);
}

const [javascript, css, airplane] = await Promise.all([
  artifactSet("dist/table-side/assets", ".js"),
  artifactSet("dist/table-side/assets", ".css"),
  readFile(path.join(root, "dist/airplane/poker-airplane.html")),
]);

const javascriptRawBytes = javascript.reduce(
  (total, bytes) => total + bytes.byteLength,
  0,
);
const javascriptGzipBytes = javascript.reduce(
  (total, bytes) => total + gzipSync(bytes, { level: 9 }).byteLength,
  0,
);
const cssRawBytes = css.reduce((total, bytes) => total + bytes.byteLength, 0);

assertBudget(
  "Table-side JavaScript raw",
  javascriptRawBytes,
  budgets.table_side_javascript_raw_bytes,
);
assertBudget(
  "Table-side JavaScript gzip",
  javascriptGzipBytes,
  budgets.table_side_javascript_gzip_bytes,
);
assertBudget(
  "Table-side CSS raw",
  cssRawBytes,
  budgets.table_side_css_raw_bytes,
);
assertBudget(
  "Airplane HTML raw",
  airplane.byteLength,
  budgets.airplane_html_raw_bytes,
);
