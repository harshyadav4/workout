/**
 * The tour, one screen part at a time. Each step names the page it is on and
 * the `data-tour` marker it points at; a step without a marker is a centred
 * card (the welcome and the end). Text in plain words, one idea a sentence,
 * because this is the first thing a new lifter reads.
 */
export interface TourStep {
  route: "/" | "/plan" | "/progress" | "/profile";
  /** The `data-tour` value of the part to highlight. Absent: a centred card. */
  target?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    route: "/",
    title: "Welcome to Arise",
    body: "This is a sample account: Alex, six months into training. Look around with real-looking numbers. Your own data is safe and comes back when the tour ends."
  },
  {
    route: "/",
    target: "home-today",
    title: "Today's session",
    body: "Home shows what is planned for today. Tap Start session when you begin, and the session clock starts."
  },
  {
    route: "/",
    target: "home-work",
    title: "Log each set",
    body: "Tap a set, check the weight and reps, and log it. The app fills in what you lifted last time, so most sets are one tap."
  },
  {
    route: "/plan",
    target: "plan-week",
    title: "Your week",
    body: "Plan shows your week. Tap a day to see its session. A dot means training, a grey dot means rest."
  },
  {
    route: "/plan",
    target: "plan-modes",
    title: "Build your sessions",
    body: "Build is where you make sessions from exercises. Schedule puts them on your days, and repeats them every week."
  },
  {
    route: "/progress",
    target: "progress-rings",
    title: "Three rings",
    body: "Strength: are your lifts going up? Consistency: sessions this week against your goal. Muscles: which groups got enough sets in the last 4 weeks."
  },
  {
    route: "/progress",
    target: "progress-tabs",
    title: "Tap for the details",
    body: "Each ring opens its own page of charts. Summary keeps the short version: your wins and one thing to try next."
  },
  {
    route: "/progress",
    target: "progress-wins",
    title: "Your wins",
    body: "New records, lifts that went up, and weeks in a row. The app finds them for you after every session."
  },
  {
    route: "/profile",
    target: "profile-body",
    title: "Your body",
    body: "Weigh in here, and add tape measurements when you like. Set a goal weight, and Progress shows when you will likely reach it."
  },
  {
    route: "/profile",
    target: "profile-data",
    title: "Your data is yours",
    body: "Download a backup any time, and restore it on any phone. Everything also saves to your account by itself."
  },
  {
    route: "/",
    title: "You are ready",
    body: "Start with your own data now, or keep looking around the sample first. You can take this tour again from the You tab."
  }
];
