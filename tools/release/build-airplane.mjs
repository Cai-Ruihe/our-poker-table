import { execFile } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const root = process.cwd();
const execFileAsync = promisify(execFile);
const airplaneBundleDirectory = path.join(root, "dist", "airplane-bundle");
const outputDirectory = path.join(root, "dist", "airplane");
await execFileAsync("pnpm", ["--filter", "@html-poker/web", "build"], {
  cwd: root,
  env: {
    ...process.env,
    HTML_POKER_AIRPLANE_BUILD: "1",
    HTML_POKER_OUTPUT_DIR: "../../dist/airplane-bundle",
  },
});
const inputPath = path.join(airplaneBundleDirectory, "index.html");
const thirdPartyLicensesPath = path.join(
  root,
  "apps",
  "web",
  "public",
  "THIRD-PARTY-LICENSES.txt",
);
const projectLicensePath = path.join(root, "LICENSE");
const faviconPath = path.join(root, "assets", "brand", "web", "favicon.svg");

let [html, thirdPartyLicenses, projectLicense, favicon] = await Promise.all([
  readFile(inputPath, "utf8"),
  readFile(thirdPartyLicensesPath, "utf8"),
  readFile(projectLicensePath, "utf8"),
  readFile(faviconPath),
]);
const moduleMatch = html.match(
  /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/u,
);
const stylesheetMatch = html.match(
  /<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/u,
);
if (!moduleMatch?.[1] || !stylesheetMatch?.[1]) {
  throw new Error(
    "The Table-side build did not contain the expected local assets.",
  );
}

const javascript = await readFile(
  path.join(airplaneBundleDirectory, moduleMatch[1]),
  "utf8",
);
let stylesheet = await readFile(
  path.join(airplaneBundleDirectory, stylesheetMatch[1]),
  "utf8",
);
for (const match of stylesheet.matchAll(/url\((['"]?)(\.\/[^)'"\s]+)\1\)/gu)) {
  const reference = match[2];
  if (!reference) continue;
  const asset = await readFile(
    path.join(airplaneBundleDirectory, "assets", reference.slice(2)),
  );
  stylesheet = stylesheet.replace(
    match[0],
    `url(data:font/woff2;base64,${asset.toString("base64")})`,
  );
}

const airplanePolicy = [
  "base-uri 'none'",
  "default-src 'none'",
  "connect-src 'none'",
  "font-src data:",
  "form-action 'none'",
  "frame-src 'none'",
  "img-src data: blob:",
  "media-src blob:",
  "object-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
].join("; ");

html = html
  .replace(
    /content="base-uri 'none'; default-src[^"]+"/u,
    `content="${airplanePolicy}"`,
  )
  .replace(
    moduleMatch[0],
    () =>
      `<script type="module">${javascript.replaceAll("</script", "<\\/script")}</script>`,
  )
  .replace(stylesheetMatch[0], () => `<style>${stylesheet}</style>`)
  .replace(
    '<script src="./poker-config.js"></script>',
    "<script>globalThis.__HTML_POKER_CONFIG__={airplaneMode:true};</script>",
  )
  .replace(
    /<link\s+[^>]*\brel="icon"[^>]*>/u,
    `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${favicon.toString("base64")}">`,
  )
  .replace(/\s*<link\s+[^>]*\brel="apple-touch-icon"[^>]*>/u, "")
  .replace(
    "<title>Our Poker Table — Digital dealer for physical tables</title>",
    "<title>Our Poker Table Airplane — Standalone digital dealer</title>",
  )
  .replace(
    "</body>",
    `<script id="html-poker-third-party-licenses" type="application/json">${JSON.stringify(
      thirdPartyLicenses,
    ).replaceAll(
      "<",
      "\\u003c",
    )}</script><script id="html-poker-project-license" type="application/json">${JSON.stringify(
      projectLicense,
    ).replaceAll("<", "\\u003c")}</script></body>`,
  );

const markupOnly = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "<script></script>")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "<style></style>");
if (/<(?:script|link|img)\b[^>]*(?:src|href)="(?!data:|#)/iu.test(markupOnly)) {
  throw new Error(
    "The Airplane artifact still contains an external asset reference.",
  );
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "poker-airplane.html"),
  `${html.trim()}\n`,
  "utf8",
);
