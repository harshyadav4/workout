import assert from "node:assert/strict";

import { isTheme, resolveTheme, THEME_BOOTSTRAP, THEME_KEY } from "@/lib/theme";

assert.equal(resolveTheme("dark", true), "dark", "an explicit choice ignores the OS");
assert.equal(resolveTheme("light", false), "light");
assert.equal(resolveTheme("system", true), "light", "system follows the OS");
assert.equal(resolveTheme("system", false), "dark", "and falls back to dark, the default palette");

assert.equal(isTheme("dark"), true);
assert.equal(isTheme("neon"), false, "an unknown stored value is not trusted");
assert.equal(isTheme(null), false, "nor is an absent one");

// The bootstrap runs before React and before paint. If it throws, the page is
// blank — so the try/catch is the assertion that matters here.
assert.match(THEME_BOOTSTRAP, /try\{/, "the bootstrap cannot be allowed to throw");
assert.match(THEME_BOOTSTRAP, /catch/);
assert.ok(THEME_BOOTSTRAP.includes(JSON.stringify(THEME_KEY)), "and reads the key the app writes");
// Only light is added as a class — dark is `:root`, so a failed read still
// paints the palette the app has always had.
assert.equal(THEME_BOOTSTRAP.includes('classList.remove'), false, "nothing to remove: dark is the default");

// The bootstrap is a hand-written string that runs before React, before paint,
// with no bundler and no types over it. Executing it against stubs is the only
// thing that proves it does what the head comment claims.
const runBootstrap = (
  stored: string | null,
  prefersLight: boolean,
  { throws = false } = {}
) => {
  const classes = new Set<string>();
  new Function(
    "localStorage",
    "matchMedia",
    "document",
    THEME_BOOTSTRAP
  )(
    {
      getItem: () => {
        if (throws) {
          throw new Error("blocked");
        }
        return stored;
      }
    },
    () => ({ matches: prefersLight }),
    { documentElement: { classList: { add: (name: string) => classes.add(name) } } }
  );
  return classes.has("light") ? "light" : "dark";
};

assert.equal(runBootstrap("light", false), "light", "an explicit light choice applies before paint");
assert.equal(runBootstrap("dark", true), "dark", "an explicit dark choice overrides a light OS");
assert.equal(runBootstrap(null, true), "light", "system follows a light OS");
assert.equal(runBootstrap(null, false), "dark", "system on a dark OS stays dark");
// Privacy modes throw on localStorage access. A theme preference is never worth
// a blank page, so this is the assertion that matters most in the file.
assert.equal(
  runBootstrap(null, true, { throws: true }),
  "dark",
  "unreadable storage falls back to the default palette instead of throwing"
);

console.log("theme.test.ts ok");
