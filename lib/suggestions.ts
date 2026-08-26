import type { MuscleId, WorkoutTemplate } from "@/lib/types";

/**
 * Exercises in your own library that lean toward a head you are under-training.
 *
 * This is what turns task 19's diagnosis into something you can do on Thursday.
 * Task 19 says *"side delts: 4 sets a week, the least of anything you train"*;
 * this adds *"these lifts you already own bias toward it."*
 *
 * **Two constraints carried straight from the plan, and neither is decoration.**
 *
 * The wording is *biased toward*, never *targets*. Per-head engagement is
 * derived from regexes against exercise names, not measured, and a suggestion
 * built on a diagnosis nobody trusts is worse than no suggestion at all.
 *
 * And it only ranks what the user already has — their own templates, restricted
 * to equipment they have actually used. A list of cable movements for someone
 * training in a garage is not advice, it is noise.
 */

/** Below this the lift barely touches the head and recommending it is a stretch. */
const MIN_ENGAGEMENT = 25;

export interface Suggestion {
  workoutId: string;
  name: string;
  /** Declared engagement for the head in question, 0-100. Derived, not measured. */
  engagement: number;
  equipment?: string;
}

export function suggestForHead(
  muscleId: MuscleId,
  templates: WorkoutTemplate[],
  options: { equipmentInUse?: string[]; limit?: number } = {}
): Suggestion[] {
  const { equipmentInUse, limit = 3 } = options;
  // An empty list means "no signal about equipment", not "no equipment" — a new
  // account has trained nothing and should still see suggestions.
  const allowed = equipmentInUse?.length
    ? new Set(equipmentInUse.map((item) => item.toLowerCase()))
    : undefined;

  return templates
    .map((template) => ({
      template,
      engagement: template.muscles.find((item) => item.muscleId === muscleId)?.engagement ?? 0
    }))
    .filter(({ template, engagement }) => {
      if (engagement < MIN_ENGAGEMENT) {
        return false;
      }
      // Unknown equipment passes: the constraint is there to filter out lifts
      // you provably cannot do, not to hide everything unlabelled.
      return !allowed || !template.equipment || allowed.has(template.equipment.toLowerCase());
    })
    .sort(
      (a, b) =>
        b.engagement - a.engagement ||
        // Stable and readable when engagement ties, which it often does — the
        // library declares round numbers.
        a.template.name.localeCompare(b.template.name)
    )
    .slice(0, limit)
    .map(({ template, engagement }) => ({
      workoutId: template.id,
      name: template.name,
      engagement,
      equipment: template.equipment
    }));
}

/** The equipment this lifter has actually trained with, for the filter above. */
export function equipmentInUse(
  workoutIds: string[],
  templates: WorkoutTemplate[]
): string[] {
  const byId = new Map(templates.map((template) => [template.id, template]));

  return [
    ...new Set(
      workoutIds
        .map((id) => byId.get(id)?.equipment)
        .filter((item): item is string => Boolean(item))
    )
  ];
}
