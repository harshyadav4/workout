// Run with: npm run check
import assert from "node:assert/strict";

import { nudgeFor, REMINDER_AFTER_SESSIONS } from "@/features/auth/nudge-rule";

const guest = {
  signedIn: false,
  touring: false,
  sessions: 1,
  finishedToday: true,
  finishAnswered: false,
  reminderDismissed: false
};

// The finish card asks after a finished session, until answered.
assert.equal(nudgeFor(guest, "finish-card"), "finish");
assert.equal(nudgeFor({ ...guest, finishAnswered: true }, "finish-card"), null, "answered once: not again");
assert.equal(nudgeFor({ ...guest, finishedToday: false }, "finish-card"), null, "nothing finished today");

// Never to someone signed in, never over the tour's sample.
assert.equal(nudgeFor({ ...guest, signedIn: true }, "finish-card"), null);
assert.equal(nudgeFor({ ...guest, touring: true }, "finish-card"), null);
assert.equal(nudgeFor({ ...guest, sessions: 9, finishedToday: false, signedIn: true }, "home"), null);
assert.equal(nudgeFor({ ...guest, sessions: 9, finishedToday: false, touring: true }, "home"), null);

// Home's quiet reminder: from three sessions, until dismissed.
const later = { ...guest, finishedToday: false, finishAnswered: true };
assert.equal(nudgeFor({ ...later, sessions: REMINDER_AFTER_SESSIONS - 1 }, "home"), null, "too early");
assert.equal(nudgeFor({ ...later, sessions: REMINDER_AFTER_SESSIONS }, "home"), "reminder");
assert.equal(nudgeFor({ ...later, sessions: 10, reminderDismissed: true }, "home"), null, "dismissed: gone");

// One question at a time: not on the day the finish card is asking.
assert.equal(nudgeFor({ ...guest, sessions: 5 }, "home"), null);
assert.equal(nudgeFor({ ...guest, sessions: 5, finishAnswered: true }, "home"), "reminder", "once the card is answered, the line may show");

console.log("sign-in nudge checks passed");
