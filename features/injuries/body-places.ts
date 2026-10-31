import { INJURY_PLACES } from "@/lib/injuries";
import type { InjuryPlace, InjurySide, MuscleId } from "@/lib/types";

/**
 * Where each place sits on the two body drawings. Pure, so a tap can be tested.
 *
 * The drawings only have muscles, and a joint is the gap between them. So a tap
 * goes to the nearest point here, and joints work too. It also means a tap can
 * never be too small a target: the whole drawing answers.
 */
export type BodyView = "front" | "back";

/** The `viewBox` of features/body/front.tsx and back.tsx. */
export const VIEW_SIZE: Record<BodyView, { width: number; height: number }> = {
  front: { width: 163, height: 310 },
  back: { width: 77, height: 147 }
};

type Point = readonly [x: number, y: number];

interface PlaceOnBody {
  /**
   * Points in the drawing's own units. For a place with a side, they are on the
   * half to your left as you look at the drawing. The other side is mirrored.
   */
  front?: readonly Point[];
  back?: readonly Point[];
  /** The muscles to light on each drawing. A joint has none, only its mark. */
  frontMuscles?: readonly MuscleId[];
  backMuscles?: readonly MuscleId[];
}

export const PLACES_ON_BODY: Record<InjuryPlace, PlaceOnBody> = {
  neck: { front: [[81.5, 40]], back: [[38.5, 17]], frontMuscles: ["traps"] },
  upperBack: {
    back: [[38.5, 33], [29, 42], [48, 42], [31, 27], [46, 27]],
    backMuscles: ["traps", "rhomboids", "lats"]
  },
  lowerBack: { back: [[38.5, 57]], backMuscles: ["erectors"] },
  // The first point of a place holds its mark. The rest only catch taps, because a
  // long muscle's far end is nearer to the next place's point than to its own.
  abs: {
    front: [[81.5, 112], [81.5, 90], [81.5, 134], [63, 124], [100, 124]],
    frontMuscles: ["abs", "obliques"]
  },
  shoulder: {
    front: [[47, 62]],
    back: [[22, 29.5]],
    frontMuscles: ["deltFront", "deltSide"],
    backMuscles: ["deltRear"]
  },
  chest: { front: [[64, 70], [60, 92]], frontMuscles: ["pecUpper", "pecLower"] },
  biceps: { front: [[45, 88]], frontMuscles: ["biceps", "brachialis"] },
  triceps: { back: [[18, 43], [21, 37]], backMuscles: ["tricepsLong", "tricepsLateral"] },
  elbow: { front: [[37, 106]], back: [[15, 52]] },
  forearm: {
    front: [[28, 122]],
    back: [[11.5, 61]],
    frontMuscles: ["forearmExtensors"],
    backMuscles: ["forearmFlexors", "forearmExtensors"]
  },
  wrist: { front: [[17, 146]], back: [[8, 67]] },
  hip: { front: [[60, 146]] },
  groin: { front: [[74, 165]], frontMuscles: ["adductors"] },
  quad: {
    front: [[60, 190]],
    frontMuscles: ["rectusFemoris", "vastusLateralis", "vastusMedialis", "sartorius"]
  },
  glute: { back: [[30, 72]], backMuscles: ["gluteMax", "gluteMed"] },
  hamstring: { back: [[30, 90]], backMuscles: ["hamsOuter", "hamsInner"] },
  knee: { front: [[69, 223]], back: [[30, 102]] },
  shin: { front: [[67, 257]], frontMuscles: ["tibialis", "soleus", "gastrocnemius"] },
  calf: { back: [[30, 116], [30, 128]], backMuscles: ["gastrocnemius", "soleus"] },
  ankle: { front: [[72, 297]], back: [[30, 139]] }
};

const PLACES = Object.keys(PLACES_ON_BODY) as InjuryPlace[];

/**
 * On Front, the half to your left is the person's right, as with someone facing
 * you. On Back, it is their left. The name under the map says which, in words.
 */
export function sideOfHalf(view: BodyView, onYourLeft: boolean): "left" | "right" {
  return (view === "front") === onYourLeft ? "right" : "left";
}

export interface BodyTap {
  place: InjuryPlace;
  /** Absent on a place on the body's middle line. */
  side?: "left" | "right";
  point: Point;
}

/** The place nearest a tap, in the drawing's own units. */
export function nearestPlace(view: BodyView, x: number, y: number): BodyTap {
  const { width } = VIEW_SIZE[view];
  let best: (BodyTap & { distance: number }) | undefined;

  const consider = (place: InjuryPlace, point: Point, side: BodyTap["side"]) => {
    const distance = (point[0] - x) ** 2 + (point[1] - y) ** 2;
    if (!best || distance < best.distance) {
      best = { place, side, point, distance };
    }
  };

  for (const place of PLACES) {
    const middle = INJURY_PLACES[place].middle;
    for (const point of PLACES_ON_BODY[place][view] ?? []) {
      if (middle) {
        consider(place, point, undefined);
      } else {
        consider(place, point, sideOfHalf(view, true));
        consider(place, [width - point[0], point[1]], sideOfHalf(view, false));
      }
    }
  }

  // Every view has places, so the loop above always finds one.
  const { place, side, point } = best as BodyTap & { distance: number };
  return { place, side, point };
}

/** The drawing a place is on. A place on both opens on Front. */
export function viewOfPlace(place: InjuryPlace): BodyView {
  return PLACES_ON_BODY[place].front ? "front" : "back";
}

/** Where the mark or marks go on a drawing: none if the place is not on it. */
export function markPoints(place: InjuryPlace, side: InjurySide | undefined, view: BodyView): Point[] {
  const first = PLACES_ON_BODY[place][view]?.[0];
  if (!first) {
    return [];
  }
  const { width } = VIEW_SIZE[view];
  const mirrored: Point = [width - first[0], first[1]];
  if (INJURY_PLACES[place].middle || !side) {
    return [first];
  }
  if (side === "both") {
    return [first, mirrored];
  }
  return [side === sideOfHalf(view, true) ? first : mirrored];
}

export function litMuscles(place: InjuryPlace, view: BodyView): readonly MuscleId[] {
  const info = PLACES_ON_BODY[place];
  return (view === "front" ? info.frontMuscles : info.backMuscles) ?? [];
}
