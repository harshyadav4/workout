// Run with: npm run check
import assert from "node:assert/strict";

import { unusedMedia } from "@/lib/archive";
import { DELETION_GRACE_DAYS, daysToRestore, deletionDate, deletionDue } from "@/lib/deletion";

const requested = "2026-10-27T10:00:00.000Z";

assert.equal(DELETION_GRACE_DAYS, 7);
assert.equal(deletionDate(requested).toISOString(), "2026-11-03T10:00:00.000Z", "one week later");

assert.equal(deletionDue(requested, new Date("2026-11-03T09:59:59Z")), false, "a second early is still restorable");
assert.equal(deletionDue(requested, new Date("2026-11-03T10:00:00Z")), true, "due on the hour");
assert.equal(deletionDue(undefined, new Date()), false, "no request, nothing due");
assert.equal(deletionDue("not a date", new Date("2030-01-01")), false, "a broken stamp never deletes");

assert.equal(daysToRestore(requested, new Date("2026-10-27T10:00:00Z")), 7);
assert.equal(daysToRestore(requested, new Date("2026-11-03T08:00:00Z")), 1, "the last morning still has a day");
assert.equal(daysToRestore(requested, new Date("2026-11-04T00:00:00Z")), 0);

// Leftover GIFs once the archive is deleted: only files nothing current uses.
assert.deepEqual(
  unusedMedia(["u/a.gif", "u/b.gif", "u/c.gif"], [{ mediaPath: "u/b.gif" }, { mediaPath: undefined }]),
  ["u/a.gif", "u/c.gif"]
);
assert.deepEqual(unusedMedia([], [{ mediaPath: "u/b.gif" }]), []);

console.log("deletion checks passed");
