// Runs after `next build`. Writes public/offline-files.json: every code file of
// this release, so the service worker can save them all at once for offline use.
// Without it a file is saved only when a screen first needs it, so a tab or a
// muscle map never opened since the last release is missing with no signal.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Code only. Fonts stay out: 40 of them ship for You → Theme, and the page saves
 * the ones it really uses the first time it loads them.
 */
export function listOfflineFiles(staticDir) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (/\.(js|css)$/.test(name)) {
        const parts = relative(staticDir, path).split(sep).map(encodeURIComponent);
        found.push(`/_next/static/${parts.join("/")}`);
      }
    }
  };
  walk(staticDir);
  return found.sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = listOfflineFiles(".next/static");
  writeFileSync("public/offline-files.json", JSON.stringify(files));
  console.log(`offline list: ${files.length} files`);
}
