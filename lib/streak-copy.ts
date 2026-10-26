/**
 * What the home streak card says, per state. Split out of the card so it is
 * testable without React — the copy is the whole feature here, and the state
 * that matters most (a missed week on top of a long history) is the one a bare
 * number gets wrong: `0` reads as a scold rather than a nudge.
 */
export function streakHeadline(currentWeeks: number, longestWeeks: number, hasLogs: boolean) {
  if (!hasLogs) {
    return { title: "Start the streak", caption: "Do 1 workout this week to start it." };
  }

  if (currentWeeks === 0) {
    return {
      title: "Start again",
      caption:
        longestWeeks > 1
          ? `Do 1 workout to start again. Record: ${longestWeeks} weeks.`
          : "Do 1 workout this week to start again."
    };
  }

  return {
    title: `${currentWeeks} week${currentWeeks === 1 ? "" : "s"} in a row`,
    caption:
      currentWeeks >= longestWeeks
        ? "Your longest streak yet."
        : `Your record: ${longestWeeks} weeks.`
  };
}
