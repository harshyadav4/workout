import {
  DailyPlan,
  Muscle,
  PlannedExercise,
  PlannedSet,
  ProfileInfo,
  ScheduledSession,
  SessionTemplate,
  WorkoutLog,
  WorkoutTemplate
} from "@/lib/types";

export const muscles: Muscle[] = [
  {
    id: "pecUpper",
    name: "Upper Chest",
    scientific: "Pectoralis major, clavicular head",
    group: "chest",
    description: "Incline pressing and low-to-high flyes.",
    intensityWeight: 1
  },
  {
    id: "pecLower",
    name: "Mid & Lower Chest",
    scientific: "Pectoralis major, sternal head",
    group: "chest",
    description: "Flat and decline pressing, dips, standard flyes.",
    intensityWeight: 1
  },
  {
    id: "serratus",
    name: "Serratus Anterior",
    scientific: "Serratus anterior",
    group: "chest",
    description: "Protraction work — pullovers, punches, overhead reaches.",
    intensityWeight: 0.5
  },
  {
    id: "deltFront",
    name: "Front Delt",
    scientific: "Anterior deltoid",
    group: "shoulders",
    description: "Overhead pressing and front raises. Also does a lot of the work on any press.",
    intensityWeight: 0.9
  },
  {
    id: "deltSide",
    name: "Side Delt",
    scientific: "Lateral deltoid",
    group: "shoulders",
    description: "Lateral raises and upright rows — the head that builds width.",
    intensityWeight: 0.9
  },
  {
    id: "deltRear",
    name: "Rear Delt",
    scientific: "Posterior deltoid",
    group: "shoulders",
    description: "Reverse flyes, face pulls, rear-delt rows. The usual weak point.",
    intensityWeight: 0.8
  },
  {
    id: "traps",
    name: "Traps",
    scientific: "Trapezius",
    group: "back",
    description: "Shrugs, high pulls, and the top of every deadlift.",
    intensityWeight: 0.8
  },
  {
    id: "rhomboids",
    name: "Rhomboids",
    scientific: "Rhomboid major & minor",
    group: "back",
    description: "Scapular retraction — rows and pull-aparts.",
    intensityWeight: 0.7
  },
  {
    id: "lats",
    name: "Lats",
    scientific: "Latissimus dorsi",
    group: "back",
    description: "Pulldowns, pull-ups, and rows. The width of the back.",
    intensityWeight: 1
  },
  {
    id: "erectors",
    name: "Lower Back",
    scientific: "Erector spinae",
    group: "back",
    description: "Deadlifts, good mornings, back extensions.",
    intensityWeight: 0.8
  },
  {
    id: "biceps",
    name: "Biceps",
    scientific: "Biceps brachii",
    group: "arms",
    description: "Supinated curls and chin-ups.",
    intensityWeight: 0.65
  },
  {
    id: "brachialis",
    name: "Brachialis",
    scientific: "Brachialis",
    group: "arms",
    description: "Hammer and reverse curls — sits under the biceps and pushes it up.",
    intensityWeight: 0.5
  },
  {
    id: "tricepsLong",
    name: "Triceps, Long Head",
    scientific: "Triceps brachii, long head",
    group: "arms",
    description: "Overhead extensions and skullcrushers — the head that needs a stretch.",
    intensityWeight: 0.65
  },
  {
    id: "tricepsLateral",
    name: "Triceps, Lateral Head",
    scientific: "Triceps brachii, lateral head",
    group: "arms",
    description: "Pushdowns, close-grip pressing, dips.",
    intensityWeight: 0.65
  },
  {
    id: "forearmFlexors",
    name: "Wrist Flexors",
    scientific: "Flexor carpi group",
    group: "arms",
    description: "Grip work, wrist curls, and every heavy hold.",
    intensityWeight: 0.4
  },
  {
    id: "forearmExtensors",
    name: "Wrist Extensors",
    scientific: "Extensor carpi group & brachioradialis",
    group: "arms",
    description: "Reverse curls and wrist extensions.",
    intensityWeight: 0.4
  },
  {
    id: "abs",
    name: "Abs",
    scientific: "Rectus abdominis",
    group: "core",
    description: "Crunches, leg raises, and bracing under load.",
    intensityWeight: 0.7
  },
  {
    id: "obliques",
    name: "Obliques",
    scientific: "External & internal oblique",
    group: "core",
    description: "Rotation and side bends — twists, woodchops, side planks.",
    intensityWeight: 0.6
  },
  {
    id: "gluteMax",
    name: "Glute Max",
    scientific: "Gluteus maximus",
    group: "legs",
    description: "Hip extension — squats, hinges, thrusts.",
    intensityWeight: 1
  },
  {
    id: "gluteMed",
    name: "Glute Med",
    scientific: "Gluteus medius",
    group: "legs",
    description: "Abduction and hip stability — the side of the hip.",
    intensityWeight: 0.6
  },
  {
    id: "rectusFemoris",
    name: "Rectus Femoris",
    scientific: "Rectus femoris",
    group: "legs",
    description: "The quad head that also flexes the hip — leg extensions, sissy squats.",
    intensityWeight: 0.9
  },
  {
    id: "vastusLateralis",
    name: "Outer Quad",
    scientific: "Vastus lateralis",
    group: "legs",
    description: "The outer sweep — squats, hack squats, presses.",
    intensityWeight: 0.9
  },
  {
    id: "vastusMedialis",
    name: "Teardrop",
    scientific: "Vastus medialis",
    group: "legs",
    description: "The teardrop above the knee — deep squats and full lockouts.",
    intensityWeight: 0.9
  },
  {
    id: "sartorius",
    name: "Sartorius",
    scientific: "Sartorius",
    group: "legs",
    description: "The long strap across the thigh — hip flexion and rotation.",
    intensityWeight: 0.4
  },
  {
    id: "adductors",
    name: "Adductors",
    scientific: "Adductor group",
    group: "legs",
    description: "Inner thigh — wide stances, adduction, sumo pulls.",
    intensityWeight: 0.6
  },
  {
    id: "hamsOuter",
    name: "Outer Hamstring",
    scientific: "Biceps femoris",
    group: "legs",
    description: "Knee flexion and hip extension — curls, RDLs, good mornings.",
    intensityWeight: 0.9
  },
  {
    id: "hamsInner",
    name: "Inner Hamstring",
    scientific: "Semitendinosus & semimembranosus",
    group: "legs",
    description: "The medial hamstring — curls and hinges.",
    intensityWeight: 0.9
  },
  {
    id: "gastrocnemius",
    name: "Calf",
    scientific: "Gastrocnemius",
    group: "legs",
    description: "Standing calf raises — the head that works with a straight knee.",
    intensityWeight: 0.6
  },
  {
    id: "soleus",
    name: "Soleus",
    scientific: "Soleus",
    group: "legs",
    description: "Seated calf raises — the head that works with a bent knee.",
    intensityWeight: 0.5
  },
  {
    id: "tibialis",
    name: "Shin",
    scientific: "Tibialis anterior",
    group: "legs",
    description: "Dorsiflexion — toe raises, and the brake on every step.",
    intensityWeight: 0.4
  }
];

// Aesthetic recomp catalog — the exercises the Mon/Tue/Thu/Sat plan uses.
export const presetWorkouts: WorkoutTemplate[] = [
  // ---- Push ----
  {
    id: "bench-press",
    name: "Bench Press",
    category: "Push",
    isPreset: true,
    equipment: "Barbell",
    searchTerms: ["chest", "push", "barbell", "heavy"],
    defaultSets: [{ sets: 4, reps: 5, weight: 70, restSeconds: 150 }],
    muscles: [
      { muscleId: "pecUpper", engagement: 60 },
      { muscleId: "pecLower", engagement: 60 },
      { muscleId: "tricepsLong", engagement: 25 },
      { muscleId: "tricepsLateral", engagement: 25 },
      { muscleId: "deltFront", engagement: 15 },
      { muscleId: "deltSide", engagement: 15 },
      { muscleId: "deltRear", engagement: 15 }
    ]
  },
  {
    id: "incline-db-press",
    name: "Incline DB Press",
    category: "Push",
    isPreset: true,
    equipment: "Dumbbell",
    searchTerms: ["chest", "upper chest", "incline", "push"],
    defaultSets: [{ sets: 4, reps: 10, weight: 24, restSeconds: 90 }],
    muscles: [
      { muscleId: "pecUpper", engagement: 55 },
      { muscleId: "deltFront", engagement: 25 },
      { muscleId: "deltSide", engagement: 25 },
      { muscleId: "deltRear", engagement: 25 },
      { muscleId: "tricepsLong", engagement: 20 },
      { muscleId: "tricepsLateral", engagement: 20 }
    ]
  },
  {
    id: "cable-fly",
    name: "Cable Fly",
    category: "Push",
    isPreset: true,
    equipment: "Cable",
    searchTerms: ["chest", "fly", "isolation"],
    defaultSets: [{ sets: 3, reps: 13, weight: 15, restSeconds: 75 }],
    muscles: [
      { muscleId: "pecUpper", engagement: 80 },
      { muscleId: "pecLower", engagement: 80 },
      { muscleId: "deltFront", engagement: 20 },
      { muscleId: "deltSide", engagement: 20 },
      { muscleId: "deltRear", engagement: 20 }
    ]
  },
  {
    id: "shoulder-press",
    name: "Overhead Press",
    category: "Push",
    isPreset: true,
    equipment: "Barbell",
    searchTerms: ["shoulders", "press", "overhead", "heavy"],
    defaultSets: [{ sets: 4, reps: 6, weight: 40, restSeconds: 120 }],
    muscles: [
      { muscleId: "deltFront", engagement: 60 },
      { muscleId: "tricepsLong", engagement: 25 },
      { muscleId: "pecUpper", engagement: 15 },
      { muscleId: "pecLower", engagement: 15 }
    ]
  },
  // ---- Pull ----
  {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    category: "Pull",
    isPreset: true,
    equipment: "Cable",
    searchTerms: ["back", "pull", "lats", "width"],
    defaultSets: [{ sets: 4, reps: 11, weight: 50, restSeconds: 90 }],
    muscles: [
      { muscleId: "lats", engagement: 65 },
      { muscleId: "traps", engagement: 65 },
      { muscleId: "rhomboids", engagement: 65 },
      { muscleId: "erectors", engagement: 65 },
      { muscleId: "biceps", engagement: 25 },
      { muscleId: "deltFront", engagement: 10 },
      { muscleId: "deltSide", engagement: 10 },
      { muscleId: "deltRear", engagement: 10 }
    ]
  },
  {
    id: "barbell-row",
    name: "Barbell Row",
    category: "Pull",
    isPreset: true,
    equipment: "Barbell",
    searchTerms: ["row", "back", "pull", "thickness"],
    defaultSets: [{ sets: 4, reps: 5, weight: 55, restSeconds: 120 }],
    muscles: [
      { muscleId: "lats", engagement: 70 },
      { muscleId: "traps", engagement: 70 },
      { muscleId: "rhomboids", engagement: 70 },
      { muscleId: "erectors", engagement: 70 },
      { muscleId: "biceps", engagement: 20 },
      { muscleId: "abs", engagement: 10 },
      { muscleId: "obliques", engagement: 10 }
    ]
  },
  {
    id: "chest-supported-row",
    name: "Chest-Supported Row",
    category: "Pull",
    isPreset: true,
    equipment: "Machine",
    searchTerms: ["row", "back", "mid back"],
    defaultSets: [{ sets: 3, reps: 8, weight: 40, restSeconds: 90 }],
    muscles: [
      { muscleId: "lats", engagement: 70 },
      { muscleId: "traps", engagement: 70 },
      { muscleId: "rhomboids", engagement: 70 },
      { muscleId: "erectors", engagement: 70 },
      { muscleId: "biceps", engagement: 20 },
      { muscleId: "deltFront", engagement: 10 },
      { muscleId: "deltSide", engagement: 10 },
      { muscleId: "deltRear", engagement: 10 }
    ]
  },
  {
    id: "seated-cable-row",
    name: "Seated Cable Row",
    category: "Pull",
    isPreset: true,
    equipment: "Cable",
    searchTerms: ["row", "back", "cable"],
    defaultSets: [{ sets: 3, reps: 13, weight: 50, restSeconds: 75 }],
    muscles: [
      { muscleId: "lats", engagement: 65 },
      { muscleId: "traps", engagement: 65 },
      { muscleId: "rhomboids", engagement: 65 },
      { muscleId: "erectors", engagement: 65 },
      { muscleId: "biceps", engagement: 25 },
      { muscleId: "deltFront", engagement: 10 },
      { muscleId: "deltSide", engagement: 10 },
      { muscleId: "deltRear", engagement: 10 }
    ]
  },
  {
    id: "face-pull",
    name: "Face Pull",
    category: "Pull",
    isPreset: true,
    equipment: "Cable",
    searchTerms: ["rear delt", "posture", "shoulders", "prehab"],
    defaultSets: [{ sets: 3, reps: 18, weight: 20, restSeconds: 60 }],
    muscles: [
      { muscleId: "deltRear", engagement: 60 },
      { muscleId: "lats", engagement: 30 },
      { muscleId: "traps", engagement: 30 },
      { muscleId: "rhomboids", engagement: 30 },
      { muscleId: "erectors", engagement: 30 },
      { muscleId: "biceps", engagement: 10 }
    ]
  },
  // ---- Legs ----
  {
    id: "back-squat",
    name: "Back Squat",
    category: "Legs",
    isPreset: true,
    equipment: "Barbell",
    searchTerms: ["legs", "squat", "quads", "priority"],
    defaultSets: [{ sets: 4, reps: 5, weight: 55, restSeconds: 180 }],
    muscles: [
      { muscleId: "rectusFemoris", engagement: 45 },
      { muscleId: "vastusLateralis", engagement: 45 },
      { muscleId: "vastusMedialis", engagement: 45 },
      { muscleId: "gluteMax", engagement: 30 },
      { muscleId: "gluteMed", engagement: 30 },
      { muscleId: "hamsOuter", engagement: 15 },
      { muscleId: "hamsInner", engagement: 15 },
      { muscleId: "abs", engagement: 10 },
      { muscleId: "obliques", engagement: 10 }
    ]
  },
  {
    id: "front-squat",
    name: "Front Squat",
    category: "Legs",
    isPreset: true,
    equipment: "Barbell",
    searchTerms: ["legs", "squat", "quads", "front"],
    defaultSets: [{ sets: 4, reps: 10, weight: 40, restSeconds: 120 }],
    muscles: [
      { muscleId: "rectusFemoris", engagement: 50 },
      { muscleId: "vastusLateralis", engagement: 50 },
      { muscleId: "vastusMedialis", engagement: 50 },
      { muscleId: "gluteMax", engagement: 25 },
      { muscleId: "gluteMed", engagement: 25 },
      { muscleId: "abs", engagement: 15 },
      { muscleId: "obliques", engagement: 15 },
      { muscleId: "hamsOuter", engagement: 10 },
      { muscleId: "hamsInner", engagement: 10 }
    ]
  },
  {
    id: "deadlift",
    name: "Deadlift",
    category: "Legs",
    isPreset: true,
    equipment: "Barbell",
    searchTerms: ["deadlift", "pull", "posterior chain", "heavy"],
    defaultSets: [{ sets: 3, reps: 5, weight: 110, restSeconds: 180 }],
    muscles: [
      { muscleId: "lats", engagement: 30 },
      { muscleId: "traps", engagement: 30 },
      { muscleId: "rhomboids", engagement: 30 },
      { muscleId: "erectors", engagement: 30 },
      { muscleId: "hamsOuter", engagement: 30 },
      { muscleId: "hamsInner", engagement: 30 },
      { muscleId: "gluteMax", engagement: 25 },
      { muscleId: "gluteMed", engagement: 25 },
      { muscleId: "rectusFemoris", engagement: 10 },
      { muscleId: "vastusLateralis", engagement: 10 },
      { muscleId: "vastusMedialis", engagement: 10 },
      { muscleId: "abs", engagement: 5 },
      { muscleId: "obliques", engagement: 5 }
    ]
  },
  {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    category: "Legs",
    isPreset: true,
    equipment: "Barbell",
    searchTerms: ["hinge", "hamstrings", "posterior chain"],
    defaultSets: [{ sets: 3, reps: 8, weight: 70, restSeconds: 120 }],
    muscles: [
      { muscleId: "hamsOuter", engagement: 45 },
      { muscleId: "hamsInner", engagement: 45 },
      { muscleId: "gluteMax", engagement: 35 },
      { muscleId: "gluteMed", engagement: 35 },
      { muscleId: "lats", engagement: 15 },
      { muscleId: "traps", engagement: 15 },
      { muscleId: "rhomboids", engagement: 15 },
      { muscleId: "erectors", engagement: 15 },
      { muscleId: "abs", engagement: 5 },
      { muscleId: "obliques", engagement: 5 }
    ]
  },
  {
    id: "leg-press",
    name: "Leg Press",
    category: "Legs",
    isPreset: true,
    equipment: "Machine",
    searchTerms: ["legs", "quads", "press"],
    defaultSets: [{ sets: 3, reps: 8, weight: 120, restSeconds: 120 }],
    muscles: [
      { muscleId: "rectusFemoris", engagement: 55 },
      { muscleId: "vastusLateralis", engagement: 55 },
      { muscleId: "vastusMedialis", engagement: 55 },
      { muscleId: "gluteMax", engagement: 30 },
      { muscleId: "gluteMed", engagement: 30 },
      { muscleId: "hamsOuter", engagement: 15 },
      { muscleId: "hamsInner", engagement: 15 }
    ]
  },
  {
    id: "leg-extension",
    name: "Leg Extension",
    category: "Legs",
    isPreset: true,
    equipment: "Machine",
    searchTerms: ["quads", "isolation"],
    defaultSets: [{ sets: 3, reps: 13, weight: 40, restSeconds: 60 }],
    muscles: [
      { muscleId: "rectusFemoris", engagement: 100 },
      { muscleId: "vastusLateralis", engagement: 100 },
      { muscleId: "vastusMedialis", engagement: 100 }
    ]
  },
  {
    id: "seated-leg-curl",
    name: "Seated Leg Curl",
    category: "Legs",
    isPreset: true,
    equipment: "Machine",
    searchTerms: ["hamstrings", "curl", "isolation"],
    defaultSets: [{ sets: 3, reps: 9, weight: 35, restSeconds: 75 }],
    muscles: [
      { muscleId: "hamsOuter", engagement: 100 },
      { muscleId: "hamsInner", engagement: 100 }
    ]
  },
  {
    id: "lying-leg-curl",
    name: "Lying Leg Curl",
    category: "Legs",
    isPreset: true,
    equipment: "Machine",
    searchTerms: ["hamstrings", "curl", "isolation"],
    defaultSets: [{ sets: 3, reps: 13, weight: 35, restSeconds: 75 }],
    muscles: [
      { muscleId: "hamsOuter", engagement: 100 },
      { muscleId: "hamsInner", engagement: 100 }
    ]
  },
  {
    id: "walking-lunge",
    name: "Walking Lunge",
    category: "Legs",
    isPreset: true,
    equipment: "Dumbbell",
    searchTerms: ["lunges", "quads", "glutes"],
    defaultSets: [{ sets: 3, reps: 11, weight: 16, restSeconds: 75 }],
    muscles: [
      { muscleId: "rectusFemoris", engagement: 40 },
      { muscleId: "vastusLateralis", engagement: 40 },
      { muscleId: "vastusMedialis", engagement: 40 },
      { muscleId: "gluteMax", engagement: 35 },
      { muscleId: "gluteMed", engagement: 35 },
      { muscleId: "hamsOuter", engagement: 15 },
      { muscleId: "hamsInner", engagement: 15 },
      { muscleId: "abs", engagement: 10 },
      { muscleId: "obliques", engagement: 10 }
    ]
  },
  {
    id: "standing-calf-raise",
    name: "Standing Calf Raise",
    category: "Legs",
    isPreset: true,
    equipment: "Machine",
    searchTerms: ["calves", "gastroc", "priority"],
    defaultSets: [{ sets: 4, reps: 9, weight: 60, restSeconds: 60 }],
    muscles: [
      { muscleId: "gastrocnemius", engagement: 100 }
    ]
  },
  {
    id: "seated-calf-raise",
    name: "Seated Calf Raise",
    category: "Legs",
    isPreset: true,
    equipment: "Machine",
    searchTerms: ["calves", "soleus", "priority"],
    defaultSets: [{ sets: 4, reps: 17, weight: 40, restSeconds: 45 }],
    muscles: [
      { muscleId: "soleus", engagement: 100 }
    ]
  },
  // ---- Arms & delts ----
  {
    id: "lateral-raise",
    name: "Lateral Raise",
    category: "Shoulders",
    isPreset: true,
    equipment: "Dumbbell",
    searchTerms: ["shoulders", "side delt", "width", "priority"],
    defaultSets: [{ sets: 4, reps: 15, weight: 8, restSeconds: 45 }],
    muscles: [
      { muscleId: "deltSide", engagement: 100 }
    ]
  },
  {
    id: "biceps-curl",
    name: "Biceps Curl",
    category: "Arms",
    isPreset: true,
    equipment: "Dumbbell",
    searchTerms: ["biceps", "curl", "arms"],
    defaultSets: [{ sets: 3, reps: 12, weight: 12, restSeconds: 60 }],
    muscles: [
      { muscleId: "biceps", engagement: 100 }
    ]
  },
  {
    id: "incline-db-curl",
    name: "Incline DB Curl",
    category: "Arms",
    isPreset: true,
    equipment: "Dumbbell",
    searchTerms: ["biceps", "curl", "stretch"],
    defaultSets: [{ sets: 3, reps: 11, weight: 10, restSeconds: 60 }],
    muscles: [
      { muscleId: "biceps", engagement: 100 }
    ]
  },
  {
    id: "cable-curl",
    name: "Cable Curl",
    category: "Arms",
    isPreset: true,
    equipment: "Cable",
    searchTerms: ["biceps", "curl", "cable"],
    defaultSets: [{ sets: 3, reps: 13, weight: 20, restSeconds: 60 }],
    muscles: [
      { muscleId: "biceps", engagement: 100 }
    ]
  },
  {
    id: "triceps-pushdown",
    name: "Triceps Pushdown",
    category: "Arms",
    isPreset: true,
    equipment: "Cable",
    searchTerms: ["triceps", "pushdown", "arms"],
    defaultSets: [{ sets: 3, reps: 13, weight: 25, restSeconds: 60 }],
    muscles: [
      { muscleId: "tricepsLateral", engagement: 100 }
    ]
  },
  {
    id: "overhead-triceps-ext",
    name: "Overhead Triceps Extension",
    category: "Arms",
    isPreset: true,
    equipment: "Cable",
    searchTerms: ["triceps", "extension", "stretch"],
    defaultSets: [{ sets: 3, reps: 11, weight: 20, restSeconds: 60 }],
    muscles: [
      { muscleId: "tricepsLong", engagement: 100 }
    ]
  },
  {
    id: "wrist-curl",
    // ponytail: no forearms muscle in the model — mapped to biceps as a proxy.
    // Add a "forearms" MuscleId + 3D mesh only if wrist tracking needs its own bar.
    name: "Wrist Curl",
    category: "Arms",
    isPreset: true,
    equipment: "Dumbbell",
    searchTerms: ["forearm", "wrist", "grip", "priority"],
    defaultSets: [{ sets: 3, reps: 15, weight: 15, restSeconds: 45 }],
    muscles: [
      { muscleId: "biceps", engagement: 100 }
    ]
  },
  // ---- Core & carry ----
  {
    id: "hanging-leg-raise",
    name: "Hanging Leg Raise",
    category: "Core",
    isPreset: true,
    equipment: "Bodyweight",
    searchTerms: ["core", "abs", "lower abs"],
    defaultSets: [{ sets: 3, reps: 13, weight: 0, restSeconds: 60 }],
    muscles: [
      { muscleId: "abs", engagement: 85 },
      { muscleId: "obliques", engagement: 85 },
      { muscleId: "rectusFemoris", engagement: 15 },
      { muscleId: "vastusLateralis", engagement: 15 },
      { muscleId: "vastusMedialis", engagement: 15 }
    ]
  },
  {
    id: "cable-crunch",
    name: "Cable Crunch",
    category: "Core",
    isPreset: true,
    equipment: "Cable",
    searchTerms: ["core", "abs", "crunch"],
    defaultSets: [{ sets: 3, reps: 13, weight: 30, restSeconds: 60 }],
    muscles: [
      { muscleId: "abs", engagement: 100 },
      { muscleId: "obliques", engagement: 100 }
    ]
  },
  {
    id: "plank",
    name: "Plank",
    category: "Core",
    isPreset: true,
    equipment: "Bodyweight",
    searchTerms: ["core", "stability"],
    defaultSets: [{ sets: 3, reps: 1, weight: 0, restSeconds: 45 }],
    muscles: [
      { muscleId: "abs", engagement: 70 },
      { muscleId: "obliques", engagement: 70 },
      { muscleId: "deltFront", engagement: 15 },
      { muscleId: "deltSide", engagement: 15 },
      { muscleId: "deltRear", engagement: 15 },
      { muscleId: "gluteMax", engagement: 15 },
      { muscleId: "gluteMed", engagement: 15 }
    ]
  },
  {
    id: "farmers-carry",
    name: "Farmer's Carry",
    category: "Carry",
    isPreset: true,
    equipment: "Dumbbell",
    searchTerms: ["grip", "carry", "core", "priority"],
    defaultSets: [{ sets: 3, reps: 1, weight: 24, restSeconds: 90 }],
    muscles: [
      { muscleId: "abs", engagement: 50 },
      { muscleId: "obliques", engagement: 50 },
      { muscleId: "lats", engagement: 40 },
      { muscleId: "traps", engagement: 40 },
      { muscleId: "rhomboids", engagement: 40 },
      { muscleId: "erectors", engagement: 40 },
      { muscleId: "biceps", engagement: 10 }
    ]
  }
];

const workoutById = (id: string): WorkoutTemplate => {
  const found = presetWorkouts.find((w) => w.id === id);
  if (!found) throw new Error(`Unknown workout id: ${id}`);
  return found;
};

// Build a flat set list (returning-lifter ramp: same load across sets, add weight when top reps hit).
// Set ids have to be unique across the whole session, not just within an
// exercise: Home tracks one open set by id across every exercise on screen.
// Deterministic rather than a UUID so server and client seed the same state.
const mkSets = (
  prefix: string,
  count: number,
  reps: number,
  weight: number,
  type: PlannedSet["type"] = "normal"
): PlannedSet[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-set-${i + 1}`,
    reps,
    weight,
    type
  }));

const sessionExercise = (
  workoutId: string,
  sets: number,
  reps: number,
  weight: number,
  restSeconds: number
) => ({
  id: `${workoutId}-tpl`,
  workoutId,
  name: workoutById(workoutId).name,
  muscles: workoutById(workoutId).muscles,
  sets,
  reps,
  weight,
  restSeconds
});

const summarize = (
  exercises: { sets: number; reps: number; weight: number }[]
) => ({
  totalSets: exercises.reduce((a, e) => a + e.sets, 0),
  totalReps: exercises.reduce((a, e) => a + e.sets * e.reps, 0),
  totalWeight: exercises.reduce((a, e) => a + e.sets * e.weight, 0)
});

const upperHeavyExercises = [
  sessionExercise("bench-press", 4, 5, 70, 150),
  sessionExercise("barbell-row", 4, 5, 55, 120),
  sessionExercise("shoulder-press", 3, 6, 40, 120),
  sessionExercise("chest-supported-row", 3, 8, 40, 90),
  sessionExercise("lateral-raise", 3, 12, 8, 45)
];

const lowerHeavyExercises = [
  sessionExercise("back-squat", 4, 5, 55, 180),
  sessionExercise("deadlift", 3, 5, 110, 180),
  sessionExercise("leg-press", 3, 8, 120, 120),
  sessionExercise("seated-leg-curl", 3, 9, 35, 75),
  sessionExercise("standing-calf-raise", 4, 9, 60, 60)
];

const upperPumpExercises = [
  sessionExercise("incline-db-press", 4, 10, 24, 90),
  sessionExercise("lat-pulldown", 4, 11, 50, 90),
  sessionExercise("cable-fly", 3, 13, 15, 75),
  sessionExercise("seated-cable-row", 3, 13, 50, 75),
  sessionExercise("lateral-raise", 4, 17, 8, 45),
  sessionExercise("biceps-curl", 3, 12, 12, 60),
  sessionExercise("triceps-pushdown", 3, 13, 25, 60)
];

const lowerPumpExercises = [
  sessionExercise("front-squat", 4, 10, 40, 120),
  sessionExercise("walking-lunge", 3, 11, 16, 75),
  sessionExercise("leg-extension", 3, 13, 40, 60),
  sessionExercise("lying-leg-curl", 3, 13, 35, 75),
  sessionExercise("seated-calf-raise", 4, 17, 40, 45),
  sessionExercise("cable-crunch", 3, 13, 30, 60)
];

const armsExercises = [
  sessionExercise("lateral-raise", 4, 17, 8, 45),
  sessionExercise("face-pull", 3, 18, 20, 60),
  sessionExercise("incline-db-curl", 3, 11, 10, 60),
  sessionExercise("cable-curl", 3, 13, 20, 60),
  sessionExercise("overhead-triceps-ext", 3, 11, 20, 60),
  sessionExercise("triceps-pushdown", 3, 13, 25, 60),
  sessionExercise("wrist-curl", 3, 15, 15, 45)
];

export const starterSessionTemplates: SessionTemplate[] = [
  {
    id: "session-upper-heavy",
    name: "Upper · Heavy",
    workoutIds: upperHeavyExercises.map((e) => e.workoutId),
    exercises: upperHeavyExercises,
    summary: summarize(upperHeavyExercises)
  },
  {
    id: "session-lower-heavy",
    name: "Lower · Heavy",
    workoutIds: lowerHeavyExercises.map((e) => e.workoutId),
    exercises: lowerHeavyExercises,
    summary: summarize(lowerHeavyExercises)
  },
  {
    id: "session-upper-pump",
    name: "Upper · Pump",
    workoutIds: upperPumpExercises.map((e) => e.workoutId),
    exercises: upperPumpExercises,
    summary: summarize(upperPumpExercises)
  },
  {
    id: "session-lower-pump",
    name: "Lower · Pump",
    workoutIds: lowerPumpExercises.map((e) => e.workoutId),
    exercises: lowerPumpExercises,
    summary: summarize(lowerPumpExercises)
  },
  {
    id: "session-arms",
    name: "Arms & Delts (optional)",
    workoutIds: armsExercises.map((e) => e.workoutId),
    exercises: armsExercises,
    summary: summarize(armsExercises)
  }
];

const plannedExercise = (
  workoutId: string,
  sets: number,
  reps: number,
  weight: number,
  restSeconds: number,
  targetNotes?: string
): PlannedExercise => ({
  id: `${workoutId}-plan`,
  workoutId,
  templateName: workoutById(workoutId).name,
  restSeconds,
  targetNotes,
  sets: mkSets(`${workoutId}-plan`, sets, reps, weight)
});

// Mon 1 · Tue 2 · Thu 4 · Fri 5 (optional) · Sat 6 — heavy/hypertrophy undulating.
export const starterPlanner: DailyPlan[] = [
  {
    dayIndex: 1,
    exercises: [
      plannedExercise("bench-press", 4, 5, 70, 150, "Heavy anchor — add weight when you hit 5 on all sets."),
      plannedExercise("barbell-row", 4, 5, 55, 120, "Heavy pull, brace hard."),
      plannedExercise("shoulder-press", 3, 6, 40, 120, "Weak point — press strict."),
      plannedExercise("chest-supported-row", 3, 8, 40, 90),
      plannedExercise("lateral-raise", 3, 12, 8, 45, "Delt width — fresh-ish, near failure.")
    ]
  },
  {
    dayIndex: 2,
    exercises: [
      plannedExercise("back-squat", 4, 5, 55, 180, "Priority weak link — first while fresh."),
      plannedExercise("deadlift", 3, 5, 110, 180, "Heavy pull toward your old 180."),
      plannedExercise("leg-press", 3, 8, 120, 120),
      plannedExercise("seated-leg-curl", 3, 9, 35, 75),
      plannedExercise("standing-calf-raise", 4, 9, 60, 60, "Weak point — full stretch + pause, onto the big toe."),
      plannedExercise("wrist-curl", 3, 15, 15, 45, "Grip/forearm weak point — finisher.")
    ]
  },
  {
    dayIndex: 4,
    exercises: [
      plannedExercise("incline-db-press", 4, 10, 24, 90, "Upper chest for the aesthetic look."),
      plannedExercise("lat-pulldown", 4, 11, 50, 90, "Back width."),
      plannedExercise("cable-fly", 3, 13, 15, 75),
      plannedExercise("seated-cable-row", 3, 13, 50, 75),
      plannedExercise("lateral-raise", 4, 17, 8, 45, "Weak point — high reps, chase the pump."),
      plannedExercise("biceps-curl", 3, 12, 12, 60),
      plannedExercise("triceps-pushdown", 3, 13, 25, 60)
    ]
  },
  {
    dayIndex: 5,
    exercises: [
      plannedExercise("lateral-raise", 4, 17, 8, 45, "Optional arms/delts day — pure aesthetic pump."),
      plannedExercise("face-pull", 3, 18, 20, 60, "Rear delt + posture."),
      plannedExercise("incline-db-curl", 3, 11, 10, 60),
      plannedExercise("cable-curl", 3, 13, 20, 60),
      plannedExercise("overhead-triceps-ext", 3, 11, 20, 60),
      plannedExercise("triceps-pushdown", 3, 13, 25, 60),
      plannedExercise("wrist-curl", 3, 15, 15, 45)
    ]
  },
  {
    dayIndex: 6,
    exercises: [
      plannedExercise("front-squat", 4, 10, 40, 120, "2nd weekly squat dose — fixes the weak link."),
      plannedExercise("walking-lunge", 3, 11, 16, 75),
      plannedExercise("leg-extension", 3, 13, 40, 60),
      plannedExercise("lying-leg-curl", 3, 13, 35, 75),
      plannedExercise("seated-calf-raise", 4, 17, 40, 45, "Weak point — bent-knee soleus, high reps."),
      plannedExercise("cable-crunch", 3, 13, 30, 60)
    ]
  }
];

const todayDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata"
}).format(new Date());

// Today lands on the plan's session for the current weekday (falls back to Upper · Heavy on rest days).
const weekdayToSession: Record<number, { id: string; name: string; exercises: PlannedExercise[] }> = {
  1: { id: "session-upper-heavy", name: "Upper · Heavy", exercises: starterPlanner[0].exercises },
  2: { id: "session-lower-heavy", name: "Lower · Heavy", exercises: starterPlanner[1].exercises },
  4: { id: "session-upper-pump", name: "Upper · Pump", exercises: starterPlanner[2].exercises },
  5: { id: "session-arms", name: "Arms & Delts (optional)", exercises: starterPlanner[3].exercises },
  6: { id: "session-lower-pump", name: "Lower · Pump", exercises: starterPlanner[4].exercises }
};

const todayDayIndex = new Date().getDay();
const todaySession = weekdayToSession[todayDayIndex] ?? weekdayToSession[1];

export const starterScheduledSessions: ScheduledSession[] = [
  {
    id: "scheduled-today",
    date: todayDate,
    dayIndex: todayDayIndex,
    sessionTemplateId: todaySession.id,
    sessionName: todaySession.name,
    type: "workout",
    status: "planned",
    source: "manual",
    exercises: todaySession.exercises
  }
];

export const starterLogs: WorkoutLog[] = [
  {
    id: "log-1",
    date: "2026-07-07",
    sessionId: "session-upper-heavy",
    workoutId: "bench-press",
    name: "Bench Press",
    totalVolume: 1300,
    totalSets: 4,
    totalReps: 20,
    peakWeight: 65,
    muscles: workoutById("bench-press").muscles
  },
  {
    id: "log-2",
    date: "2026-07-08",
    sessionId: "session-lower-heavy",
    workoutId: "back-squat",
    name: "Back Squat",
    totalVolume: 1000,
    totalSets: 4,
    totalReps: 20,
    peakWeight: 50,
    muscles: workoutById("back-squat").muscles
  },
  {
    id: "log-3",
    date: "2026-07-08",
    sessionId: "session-lower-heavy",
    workoutId: "deadlift",
    name: "Deadlift",
    totalVolume: 1500,
    totalSets: 3,
    totalReps: 15,
    peakWeight: 100,
    muscles: workoutById("deadlift").muscles
  },
  {
    id: "log-4",
    date: "2026-07-11",
    sessionId: "session-upper-pump",
    workoutId: "lateral-raise",
    name: "Lateral Raise",
    totalVolume: 1088,
    totalSets: 4,
    totalReps: 68,
    peakWeight: 8,
    muscles: workoutById("lateral-raise").muscles
  },
  {
    id: "log-5",
    date: "2026-07-14",
    sessionId: "session-upper-heavy",
    workoutId: "bench-press",
    name: "Bench Press",
    totalVolume: 1400,
    totalSets: 4,
    totalReps: 20,
    peakWeight: 70,
    muscles: workoutById("bench-press").muscles
  },
  {
    id: "log-6",
    date: "2026-07-15",
    sessionId: "session-lower-heavy",
    workoutId: "back-squat",
    name: "Back Squat",
    totalVolume: 1100,
    totalSets: 4,
    totalReps: 20,
    peakWeight: 55,
    muscles: workoutById("back-squat").muscles
  }
];

export const starterProfile: ProfileInfo = {
  name: "Harsh Patel",
  email: "harshpatel@gmail.com",
  heightCm: 172,
  weightKg: 72
};
