import type { MuscleId } from "@/lib/types";

export interface Exercise {
  id: string;
  name: string;
  category: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondary: string[];
  muscleGroup: string;
  image: string;
  gif: string;
  steps: string[];
}

export interface ExerciseFilters {
  query?: string;
  bodyPart?: string;
  equipment?: string;
  target?: string;
}

/**
 * The dataset names ~50 muscles but only coarsely — 158 exercises say
 * `pectorals` and exactly 3 say `upper chest`. So a dataset name maps to every
 * app muscle it could mean, and `deriveEngagement` narrows that set using the
 * exercise name. Names with no trainable muscle (cardio, grip, hands) are
 * intentionally absent and simply carry no engagement.
 */
export const MUSCLE_MAP: Record<string, MuscleId[]> = {
  // chest
  chest: ["pecUpper", "pecLower"],
  pectorals: ["pecUpper", "pecLower"],
  "upper chest": ["pecUpper"],
  "serratus anterior": ["serratus"],
  // shoulders
  shoulders: ["deltFront", "deltSide", "deltRear"],
  delts: ["deltFront", "deltSide", "deltRear"],
  deltoids: ["deltFront", "deltSide", "deltRear"],
  "rear deltoids": ["deltRear"],
  "rotator cuff": ["deltRear"],
  // back
  back: ["lats", "traps", "rhomboids", "erectors"],
  lats: ["lats"],
  "latissimus dorsi": ["lats"],
  "upper back": ["traps", "rhomboids"],
  rhomboids: ["rhomboids"],
  trapezius: ["traps"],
  traps: ["traps"],
  "levator scapulae": ["traps"],
  sternocleidomastoid: ["traps"],
  "lower back": ["erectors"],
  spine: ["erectors"],
  // arms
  biceps: ["biceps"],
  brachialis: ["brachialis"],
  triceps: ["tricepsLong", "tricepsLateral"],
  forearms: ["forearmFlexors", "forearmExtensors"],
  "wrist flexors": ["forearmFlexors"],
  "wrist extensors": ["forearmExtensors"],
  wrists: ["forearmFlexors", "forearmExtensors"],
  "grip muscles": ["forearmFlexors"],
  // core
  abs: ["abs"],
  abdominals: ["abs"],
  "lower abs": ["abs"],
  core: ["abs", "obliques"],
  obliques: ["obliques"],
  "hip flexors": ["sartorius", "abs"],
  // legs
  glutes: ["gluteMax", "gluteMed"],
  abductors: ["gluteMed"],
  quads: ["rectusFemoris", "vastusLateralis", "vastusMedialis"],
  quadriceps: ["rectusFemoris", "vastusLateralis", "vastusMedialis"],
  adductors: ["adductors"],
  "inner thighs": ["adductors"],
  groin: ["adductors"],
  hamstrings: ["hamsOuter", "hamsInner"],
  calves: ["gastrocnemius", "soleus"],
  soleus: ["soleus"],
  shins: ["tibialis"],
  ankles: ["tibialis", "soleus"],
  "ankle stabilizers": ["tibialis", "soleus"],
  feet: ["tibialis"]
};

/**
 * The dataset cannot tell an incline press from a decline one, but the exercise
 * name can. When a rule matches, the muscles it names win over the coarse
 * dataset bucket; when none matches, the whole bucket is worked — a flye really
 * does hit both pec heads, a squat really does hit all three vasti.
 *
 * Order matters: the first match wins, so put the specific patterns first.
 */
const HEAD_RULES: Array<{ test: RegExp; ids: MuscleId[] }> = [
  { test: /\bincline\b/i, ids: ["pecUpper"] },
  { test: /\bdecline\b|\bdip\b|\bdips\b/i, ids: ["pecLower"] },
  { test: /rear delt|reverse fly|rear fly|face pull|reverse pec/i, ids: ["deltRear"] },
  { test: /lateral raise|side raise|upright row/i, ids: ["deltSide"] },
  { test: /front raise|shoulder press|military press|overhead press|arnold/i, ids: ["deltFront"] },
  { test: /shrug/i, ids: ["traps"] },
  { test: /seated calf|calf press.*seated/i, ids: ["soleus"] },
  { test: /calf raise|calf press|standing calf/i, ids: ["gastrocnemius"] },
  { test: /reverse curl|wrist extension/i, ids: ["forearmExtensors"] },
  { test: /wrist curl|farmer|grip/i, ids: ["forearmFlexors"] },
  { test: /hammer curl/i, ids: ["brachialis"] },
  { test: /skull ?crusher|overhead (triceps|extension)|french press/i, ids: ["tricepsLong"] },
  { test: /pushdown|press ?down|kickback|close.grip/i, ids: ["tricepsLateral"] },
  { test: /abduction|abductor|side.lying leg raise/i, ids: ["gluteMed"] },
  { test: /adduction|adductor|sumo|straddle/i, ids: ["adductors"] },
  { test: /twist|woodchop|side bend|oblique|russian/i, ids: ["obliques"] },
  { test: /leg extension|sissy/i, ids: ["rectusFemoris"] },
  { test: /hack squat|leg press/i, ids: ["vastusLateralis", "vastusMedialis"] }
];

const PRIMARY_ENGAGEMENT = 60;
const SECONDARY_POOL = 40;
const SOLO_ENGAGEMENT = 100;

/**
 * Narrow a coarse dataset bucket to the head(s) the exercise name points at.
 * A rule only applies when it actually overlaps the bucket, so "close-grip
 * bench press" biases the triceps without hijacking the chest.
 */
function narrow(ids: MuscleId[], exerciseName: string): MuscleId[] {
  if (ids.length < 2) {
    return ids;
  }
  const rule = HEAD_RULES.find(
    (candidate) => candidate.test.test(exerciseName) && candidate.ids.some((id) => ids.includes(id))
  );
  return rule ? rule.ids.filter((id) => ids.includes(id)) : ids;
}

function toMuscleIds(name: string, exerciseName: string): MuscleId[] {
  return narrow(MUSCLE_MAP[name.trim().toLowerCase()] ?? [], exerciseName);
}

/**
 * Derive per-muscle engagement % from the dataset's target + secondary muscles,
 * since the dataset carries no percentages. Primary takes the bulk; secondaries
 * split the rest. Every head the exercise works gets the full share rather than
 * a divided one — engagement is how hard that muscle works, not a budget to
 * spread. Users can adjust afterwards on the Build screen.
 */
export function deriveEngagement(
  exercise: Pick<Exercise, "name" | "target" | "secondary">
): Partial<Record<MuscleId, number>> {
  const primary = toMuscleIds(exercise.target, exercise.name);
  const secondaries = [
    ...new Set(
      (exercise.secondary ?? [])
        .flatMap((name) => toMuscleIds(name, exercise.name))
        .filter((id) => !primary.includes(id))
    )
  ];

  const result: Partial<Record<MuscleId, number>> = {};
  const primaryShare = secondaries.length ? PRIMARY_ENGAGEMENT : SOLO_ENGAGEMENT;
  primary.forEach((id) => {
    result[id] = primaryShare;
  });
  if (secondaries.length) {
    const share = Math.max(5, Math.round(SECONDARY_POOL / secondaries.length));
    secondaries.forEach((id) => {
      result[id] = Math.min(100, (result[id] ?? 0) + share);
    });
  }
  return result;
}

const MEDIA_BASE = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/";

export function exerciseImageUrl(exercise: Pick<Exercise, "image">): string {
  return MEDIA_BASE + exercise.image;
}

export function exerciseGifUrl(exercise: Pick<Exercise, "gif">): string {
  return MEDIA_BASE + exercise.gif;
}

let cache: Exercise[] | null = null;

export async function loadExercises(): Promise<Exercise[]> {
  if (cache) {
    return cache;
  }
  const response = await fetch("/exercises.json");
  if (!response.ok) {
    throw new Error(`Failed to load exercises (${response.status})`);
  }
  cache = (await response.json()) as Exercise[];
  return cache;
}

export function filterExercises(list: Exercise[], filters: ExerciseFilters): Exercise[] {
  const query = filters.query?.trim().toLowerCase();
  return list.filter((exercise) => {
    if (
      query &&
      !exercise.name.toLowerCase().includes(query) &&
      !exercise.target.toLowerCase().includes(query) &&
      !exercise.equipment.toLowerCase().includes(query)
    ) {
      return false;
    }
    if (filters.bodyPart && exercise.bodyPart !== filters.bodyPart) {
      return false;
    }
    if (filters.equipment && exercise.equipment !== filters.equipment) {
      return false;
    }
    if (filters.target && exercise.target !== filters.target) {
      return false;
    }
    return true;
  });
}

export function distinctValues(list: Exercise[], key: "bodyPart" | "equipment" | "target"): string[] {
  return [...new Set(list.map((exercise) => exercise[key]))].sort();
}
