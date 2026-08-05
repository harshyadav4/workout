/**
 * What the home streak card says, per state. Split out of the card so it is
 * testable without React — the copy is the whole feature here, and the state
 * that matters most (a missed week on top of a long history) is the one a bare
 * number gets wrong: `0` reads as a scold rather than a nudge.
 */
export function streakHeadline(currentWeeks: number, longestWeeks: number, hasLogs: boolean) {
  if (!hasLogs) {
    return { title: "Start the streak", caption: "One session this week is all it takes." };
  }

  if (currentWeeks === 0) {
    return {
      title: "Pick it back up",
      caption:
        longestWeeks > 1
          ? `You have held ${longestWeeks} weeks before. One session restarts it.`
          : "One session this week puts you back on."
    };
  }

  return {
    title: `${currentWeeks} week${currentWeeks === 1 ? "" : "s"} in a row`,
    caption:
      currentWeeks >= longestWeeks
        ? "Your longest run yet. Keep it."
        : `Best so far: ${longestWeeks} weeks.`
  };
}
