import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const broadConnectPolicy = "connect-src 'self' https: wss:;";
const localQrImagePolicy = "img-src 'self' data: blob:;";

function validatedServiceUrl(candidate, variableName) {
  if (!candidate) {
    return undefined;
  }
  let service;
  try {
    service = new URL(candidate);
  } catch {
    throw new Error(`The ${variableName} is invalid.`);
  }
  if (service.protocol !== "wss:") {
    throw new Error(`The ${variableName} must use wss://.`);
  }
  if (
    service.username ||
    service.password ||
    service.pathname !== "/" ||
    service.search ||
    service.hash
  ) {
    throw new Error(`The ${variableName} must contain only its wss:// origin.`);
  }
  return service.origin;
}

export async function configureTableSideBuild(
  root = process.cwd(),
  singleRelayCandidate = process.env.TABLE_SIDE_CONNECTION_SERVICE_URL,
  fallbackCandidate = process.env.TABLE_SIDE_MAC_RELAY_URL,
) {
  const tableSideDirectory = path.join(root, "dist", "table-side");
  const htmlPath = path.join(tableSideDirectory, "index.html");
  const configPath = path.join(tableSideDirectory, "poker-config.js");
  const html = await readFile(htmlPath, "utf8");
  if (!html.includes(broadConnectPolicy)) {
    throw new Error(
      "The Table-side artifact no longer contains the expected baseline connect-src policy.",
    );
  }
  if (!html.includes(localQrImagePolicy)) {
    throw new Error(
      "The Table-side artifact CSP must allow blob: images for local QR scans.",
    );
  }
  const cloudCandidate = process.env.TABLE_SIDE_CLOUD_RELAY_URL?.trim();
  const macCandidate =
    fallbackCandidate?.trim() || singleRelayCandidate?.trim();
  const cloudOrigin = validatedServiceUrl(
    cloudCandidate,
    "TABLE_SIDE_CLOUD_RELAY_URL",
  );
  const macOrigin = validatedServiceUrl(
    macCandidate,
    fallbackCandidate?.trim()
      ? "TABLE_SIDE_MAC_RELAY_URL"
      : "TABLE_SIDE_CONNECTION_SERVICE_URL",
  );
  if (!cloudOrigin && !macOrigin) {
    return { configured: false };
  }
  const origins = [cloudOrigin, macOrigin].filter(Boolean);
  const connectOrigins = origins
    .flatMap((origin) => [origin.replace(/^wss:/u, "https:"), origin])
    .join(" ");
  const configuredHtml = html.replace(
    broadConnectPolicy,
    `connect-src 'self' ${connectOrigins};`,
  );
  const configLines = [
    "/* Generated at deployment. Contains no operator secret. */",
    "globalThis.__HTML_POKER_CONFIG__ = {",
    cloudOrigin
      ? `  cloudRelay: { url: ${JSON.stringify(cloudOrigin)} },`
      : undefined,
    macOrigin
      ? `  privateRelay: { url: ${JSON.stringify(macOrigin)} },`
      : undefined,
    "};",
    "",
  ].filter((line) => line !== undefined);
  const config = configLines.join("\n");
  await Promise.all([
    writeFile(htmlPath, configuredHtml, "utf8"),
    writeFile(configPath, config, "utf8"),
  ]);
  return {
    configured: true,
    cloudOrigin,
    macOrigin,
    origins,
  };
}

async function main() {
  const result = await configureTableSideBuild();
  process.stdout.write(
    result.configured
      ? `Configured Table-side build for ${result.origins.join(", ")}\n`
      : "Table-side build left without a relay configuration.\n",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Table-side configuration failed."}\n`,
    );
    process.exitCode = 1;
  });
}
