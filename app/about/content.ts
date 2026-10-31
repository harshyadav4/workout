/**
 * The words on /about. The page and its JSON-LD both read from here, so the
 * FAQ that search engines see is the FAQ that people see.
 * Style: short sentences, active voice. "Workout", never "session".
 */

export type Faq = { question: string; answer: string };

export const FAQS: Faq[] = [
  {
    question: "Is Arise free?",
    answer: "Yes. Arise is a free workout tracker. It runs in your browser, and you can install it as an app."
  },
  {
    question: "Do I need an account?",
    answer:
      "No. Open the app and start a workout. Your data saves on your phone. Sign in with Google only if you want to save your data to an account and sync it."
  },
  {
    question: "Does it work offline?",
    answer:
      "Yes. Arise works with no signal in the gym. It saves each set on your phone. When you sign in, it syncs when you are back online."
  },
  {
    question: "How do I install it on iPhone or Android?",
    answer:
      "On iPhone, open Arise in Safari, tap Share, then tap Add to Home Screen. On Android, open it in Chrome, tap the menu, then tap Install app or Add to Home screen."
  },
  {
    question: "Can ChatGPT make my workout plan?",
    answer:
      "Yes. In Plan, tap Build with AI and copy the question. Paste it into ChatGPT, Claude or Gemini and answer what it asks. Paste its plan back, and Arise fills in your workouts and your calendar."
  },
  {
    question: "What does the muscle map show?",
    answer:
      "It shows a front and back body figure. Today's workout colors the muscles it trains, and a deeper color means more sets. Tap a muscle to see its name. On Progress, the Muscles card shows which muscles are ready to train."
  },
  {
    question: "Does Arise track food too?",
    answer:
      "Yes. The circle in the middle of the dock flips Arise between Workout and Diet. Build meals from 542 Indian foods or type your own. Plan your days by hand or with AI, tick each meal as you eat it, and see your calories, protein and spend."
  },
  {
    question: "Is my data private, and can I delete it?",
    answer:
      "Your data stays on your phone, or in your own account if you sign in. You can download a backup at any time. You can delete all your data, and you have 7 days to restore it."
  }
];

export type Feature = {
  id: string;
  title: string;
  lead: string;
  points: string[];
  image: string;
  alt: string;
};

export const FEATURES: Feature[] = [
  {
    id: "log",
    title: "Log a workout in one tap per set",
    lead: "Start today's workout and log each set with one tap. Arise fills in the weight and reps from last time.",
    points: [
      "A rest timer times your rest between sets.",
      "A live clock shows how long the workout runs.",
      "Progression rules can raise the weight when you are ready."
    ],
    image: "/screenshots/home.png",
    alt: "Arise Today screen: the week on an arc, today's workout with a Start workout button, and its exercises"
  },
  {
    id: "muscles",
    title: "See the muscles you work",
    lead: "A front and back body map shows the muscles today's workout trains. A deeper color means more sets.",
    points: [
      "Tap a muscle to see its name.",
      "The Muscles card on Progress shows which muscles are ready to train.",
      "Weekly sets per muscle group show where your training goes."
    ],
    image: "/screenshots/muscles.png",
    alt: "Arise muscle map: front and back body figures with the trained muscles shaded by number of sets"
  },
  {
    id: "plan",
    title: "Build a plan, or let AI build it",
    lead: "Pick exercises from a library with demo GIFs and put workouts on your weekdays. Or use Build with AI.",
    points: [
      "Copy the question into ChatGPT, Claude or Gemini.",
      "Paste its plan back into Arise.",
      "Your workouts and your calendar fill in."
    ],
    image: "/screenshots/plan-ai.png",
    alt: "Arise Plan screen: Add workout and Build with AI buttons above a list of your workouts"
  },
  {
    id: "progress",
    title: "Track your records and progress",
    lead: "Three cards show your Strength, Consistency and Muscles. Wins and records show what went up.",
    points: [
      "1-rep max estimates and records for each exercise.",
      "Workouts per week and a bodyweight trend with a goal date.",
      "Cardio: distance, pace and records for runs, rides and swims.",
      "The science inside each card: strength standards, body composition and race times."
    ],
    image: "/screenshots/progress.png",
    alt: "Arise Progress screen: Strength, Consistency and Muscles cards above your wins and the weight you lifted"
  },
  {
    id: "diet",
    title: "Plan your meals and see what they cost",
    lead: "The circle in the middle of the dock flips Arise from Workout to Diet. Build meals from 542 Indian foods with their calories and protein, and add what each meal costs you.",
    points: [
      "Meals: tick each meal as you eat it, and watch calories, protein, carbs and fat fill up.",
      "Diet plan: build your days by hand or with AI, and put them on a calendar.",
      "Intake: Eating, Money and Body goals cards show what you eat, what you spend and the path to your target weight."
    ],
    image: "/screenshots/diet.png",
    alt: "Arise Meals screen: calories eaten on an arc, bars for protein, carbs and fat, and today's meals to tick, each with its cost"
  }
];

/** Also true, too small for a section of its own. */
export const EXTRAS: string[] = [
  "Calisthenics skill levels",
  "A game-style Hunter rank from E to S",
  "A guided tour on sample data",
  "Backup download and restore"
];
