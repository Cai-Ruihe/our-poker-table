import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const introRoot = path.resolve(root, "dist/intro");
const tableSideRoot = path.resolve(root, "dist/table-side");
const airplanePath = path.resolve(root, "dist/airplane/poker-airplane.html");
const rootRedirectPath = path.resolve(root, "apps/landing/root-redirect.html");
const port = Number(process.env.HTML_POKER_LANDING_TEST_PORT ?? 4181);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

async function sendFile(response, filePath) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-length": fileStat.size,
      "content-type":
        contentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

  for (const prefix of ["", "/our-poker-table"]) {
    if (pathname === `${prefix}/`) {
      await sendFile(response, rootRedirectPath);
      return;
    }

    if (pathname === `${prefix}/intro`) {
      response.writeHead(308, { location: `${prefix}/intro/` });
      response.end();
      return;
    }

    if (pathname === `${prefix}/poker-airplane.html`) {
      await sendFile(response, airplanePath);
      return;
    }

    for (const [route, directory] of [
      ["intro", introRoot],
      ["table-side", tableSideRoot],
    ]) {
      const routeRoot = `${prefix}/${route}/`;
      if (!pathname.startsWith(routeRoot)) continue;

      const relativePath = pathname.slice(routeRoot.length) || "index.html";
      const candidate = path.resolve(directory, relativePath);
      if (
        candidate === directory ||
        candidate.startsWith(`${directory}${path.sep}`)
      ) {
        await sendFile(response, candidate);
        return;
      }
    }
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Landing QA server listening on ${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
