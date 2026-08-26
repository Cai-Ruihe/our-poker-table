import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const candidates = process.argv
    .slice(2)
    .filter((value) => value !== "--")
    .map((value) => value.trim())
    .filter(Boolean);
  if (candidates.length !== 1) {
    throw new Error(
      "Usage: pnpm relay:create-token -- /absolute/path/to/operator-token",
    );
  }
  const [candidate] = candidates;
  const tokenPath = path.resolve(candidate);
  await mkdir(path.dirname(tokenPath), { mode: 0o700, recursive: true });
  const token = randomBytes(32).toString("base64url");
  try {
    await writeFile(tokenPath, `${token}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error(
        `Refusing to overwrite existing token file: ${tokenPath}`,
        { cause: error },
      );
    }
    throw error;
  }
  process.stdout.write(
    `Created a new private Table-side Mode operator token at ${tokenPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Token creation failed."}\n`,
  );
  process.exitCode = 1;
});
