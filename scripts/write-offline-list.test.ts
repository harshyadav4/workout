// Run with: npm run check
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// @ts-expect-error Plain JavaScript on purpose: `next build` runs it with node, with no compile step.
import { listOfflineFiles } from "./write-offline-list.mjs";

const dir = mkdtempSync(join(tmpdir(), "offline-list-"));
try {
  mkdirSync(join(dir, "chunks"));
  mkdirSync(join(dir, "media"));
  mkdirSync(join(dir, "BUILD-ID"));
  for (const file of [
    "chunks/0sy2u~.aj4ybf.js",
    "chunks/app.css",
    "chunks/app.js.map",
    "chunks/[weird] name.js",
    "media/outfit.woff2",
    "BUILD-ID/_buildManifest.js"
  ]) {
    writeFileSync(join(dir, file), "x");
  }

  assert.deepEqual(listOfflineFiles(dir), [
    "/_next/static/BUILD-ID/_buildManifest.js",
    "/_next/static/chunks/%5Bweird%5D%20name.js",
    "/_next/static/chunks/0sy2u~.aj4ybf.js",
    "/_next/static/chunks/app.css"
  ]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// The worker and the build must agree on the list's address.
{
  const worker = readFileSync("public/sw.js", "utf8");
  assert.ok(worker.includes('"/offline-files.json"'), "the worker reads the list the build writes");
  assert.match(
    readFileSync("package.json", "utf8"),
    /"build": "next build && node scripts\/write-offline-list\.mjs"/,
    "every build writes the list"
  );
  assert.match(readFileSync(".gitignore", "utf8"), /public\/offline-files\.json/, "it belongs to the build, not the repo");
}

console.log("offline list checks passed");
