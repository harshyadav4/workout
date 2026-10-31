/**
 * The tour, one screen part at a time. Each step names the page it is on and
 * the `data-tour` marker it points at; a step without a marker is a centred
 * card (the welcome, the words, the end).
 *
 * Written in ASD-STE100 style, because this is the first thing a new lifter
 * reads: short sentences, one idea in each, active voice, and every term
 * defined before it is used. One term for one thing — "workout", never
 * "session". Two or three sentences a step: the bubble sits over the page.
 */
export interface TourStep {
  route: "/" | "/plan" | "/progress" | "/profile";
  /** A tab of the page, as its URL query — Plan's Build tab is `mode=build`. */
  query?: string;
  /** The `data-tour` value of the part to highlight. Absent: a centred card. */
  target?: string;
  /** The side of the app this step shows. Absent: Workout. */
  area?: "diet";
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    route: "/",
    title: "Welcome to Arise",
    body: "This sample account shows Alex after 6 months of training and meal plans. Your own data is safe. It comes back when the tour ends."
  },
  {
    route: "/",
    title: "Three words you will see",
    body: "A workout is the exercises you do in one gym visit. A set is one round of an exercise. A rep is one movement in a set."
  },
  {
    route: "/",
    target: "home-today",
    title: "Today's workout",
    body: "Home shows today's workout. Tap Start workout when you begin. A clock counts your time."
  },
  {
    route: "/",
    target: "home-work",
    title: "Log each set",
    body: "Do a set, then tap it to log it. The app fills in your weight and reps from last time."
  },
  {
    route: "/",
    target: "home-muscles",
    title: "Muscle map",
    body: "The map shows the muscles today's workout trains. Darker means more sets. Tap a muscle to see its name."
  },
  {
    route: "/plan",
    target: "plan-week",
    title: "Your week",
    body: "Tap a day to see its workout. A bright dot is a training day. A faint dot is a rest day. A warm dot is a finished workout."
  },
  {
    route: "/plan",
    target: "plan-modes",
    title: "Build and Schedule",
    body: "Build: make a workout from exercises. Schedule: put your workouts on days. They repeat each week."
  },
  {
    route: "/plan",
    query: "mode=build",
    target: "plan-ai",
    title: "Build with AI",
    body: "Copy the prompt into an AI app, for example ChatGPT. Paste its answer here. Your workouts and calendar fill in."
  },
  {
    route: "/progress",
    target: "progress-modes",
    title: "Gym and Cardio",
    body: "Gym shows your weight training. Cardio shows your runs, rides and swims."
  },
  {
    route: "/progress",
    target: "progress-rings",
    title: "Three cards",
    body: "Strength: does your weight go up? Consistency: your workouts this week. Muscles: enough sets for each muscle group. Tap a card to see all of its charts."
  },
  {
    route: "/progress",
    query: "view=body",
    target: "progress-recovery",
    title: "Ready today",
    body: "This map shows which muscles have recovered. Train the ready ones next."
  },
  {
    route: "/progress",
    target: "progress-wins",
    title: "Your wins",
    body: "New records, exercises that went up, and weeks in a row. The app finds them after each workout."
  },
  {
    route: "/",
    target: "nav-area",
    title: "Workout and Diet",
    body: "Tap this circle to change between Workout and Diet. The tabs change their names and show the other side of the app."
  },
  {
    route: "/",
    area: "diet",
    target: "diet-today",
    title: "Today's meals",
    body: "This list shows your meals for today, in time order. Tick the box when you eat a meal. Tap Skip if you do not eat it."
  },
  {
    route: "/plan",
    query: "mode=build",
    area: "diet",
    target: "diet-plan-build",
    title: "Your meal plans",
    body: "Build a day of meals by hand, from the food library, or with AI. Foods from the library also give micronutrients. Then put your plans on days in Schedule."
  },
  {
    route: "/progress",
    area: "diet",
    target: "diet-intake",
    title: "Your food in three cards",
    body: "Eating shows your calories, your protein and your micronutrients. Money shows what you spent. Body goals shows your path to your target weight. Only the meals you tick count."
  },
  {
    route: "/profile",
    target: "profile-body",
    title: "Your body",
    body: "Add your weight and tape measurements. Set a goal weight. Progress then shows when you will likely reach it."
  },
  {
    route: "/profile",
    target: "profile-data",
    title: "Your data is yours",
    body: "Download a backup at any time, and restore it on any phone. Sign in to also save your data to your account."
  },
  {
    route: "/",
    title: "You are ready",
    body: "Start with your own data, or look at the sample first. The You tab has this tour again."
  }
];
