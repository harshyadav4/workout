// Run with: npm run check
import assert from "node:assert/strict";

import { landingPath, SOURCES } from "@/lib/sources";

assert.equal(landingPath("reddit"), "/about?utm_source=reddit&utm_medium=social&utm_campaign=launch");
assert.equal(landingPath("share"), "/about?utm_source=share&utm_medium=app-share&utm_campaign=launch");
assert.equal(landingPath("made-up"), "/about?utm_source=other&utm_medium=unknown&utm_campaign=launch", "unknown names count as other");
assert.equal(landingPath("toString"), "/about?utm_source=other&utm_medium=unknown&utm_campaign=launch", "not fooled by object built-ins");
assert.ok(Object.keys(SOURCES).every((name) => /^[a-z]+$/.test(name)), "short, lowercase names");

console.log("source link checks passed");
