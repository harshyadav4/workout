# Anatomical muscle taxonomy + exercise media — build spec

> **Status: shipped.** All four tracks landed. `npx tsc --noEmit`, `npm run check`
> and `npm run build` are green. Kept as the record of why the ids and path
> assignments are what they are — regenerating either SVG means redoing the
> path table below.

Decision: full anatomical split with proper muscle names, not just the muscles
named in the request. Verified against the actual SVG path geometry — every id
below is a shape the illustration really draws, checked on a numbered render of
all 207 muscle paths.

Earlier concern retracted: **calves do split.** Back paths 19/20 are the
gastrocnemius bellies and 5/6 are a separate soleus strip below them. The only
thing I could not find a distinct shape for is pec minor (it sits under the pec
major and is not drawn).

---

## The taxonomy — 30 muscles, grouped

`MuscleId` values are camelCase; `name` is what the UI shows; `scientific` is
shown in the muscle-reference popup.

### Chest
| id | name | scientific | paths |
|---|---|---|---|
| `pecUpper` | Upper Chest | Pectoralis major, clavicular head | F 30, 31 |
| `pecLower` | Mid & Lower Chest | Pectoralis major, sternal head | F 2, 3 |
| `serratus` | Serratus Anterior | Serratus anterior | F 50, 51, 73, 74, 80, 81, 111, 112, 127, 128, 129, 130 |

### Shoulders
| id | name | scientific | paths |
|---|---|---|---|
| `deltFront` | Front Delt | Anterior deltoid | F 18, 19 |
| `deltSide` | Side Delt | Lateral deltoid | F 32, 33 |
| `deltRear` | Rear Delt | Posterior deltoid | B 53, 54, 57, 58, 60, 63 |

### Back
| id | name | scientific | paths |
|---|---|---|---|
| `traps` | Traps | Trapezius | B 65, 66, 71, 73 · F 69, 70 |
| `rhomboids` | Rhomboids | Rhomboid major & minor | B 67, 69 |
| `lats` | Lats | Latissimus dorsi | B 55, 56 |
| `erectors` | Lower Back | Erector spinae | B 25, 26, 27, 28 |

### Arms
| id | name | scientific | paths |
|---|---|---|---|
| `biceps` | Biceps | Biceps brachii | F 6, 7 |
| `brachialis` | Brachialis | Brachialis | F 84, 85 |
| `tricepsLong` | Triceps, Long Head | Triceps brachii, long head | B 47, 50 |
| `tricepsLateral` | Triceps, Lateral Head | Triceps brachii, lateral head | B 45, 46, 48, 49 · F 71, 72 |
| `forearmFlexors` | Wrist Flexors | Flexor carpi group | B 36, 38, 40, 44 (inner) |
| `forearmExtensors` | Wrist Extensors | Extensor carpi / brachioradialis | F 58, 59 · B 35, 37, 39, 43 (outer) |

### Core
| id | name | scientific | paths |
|---|---|---|---|
| `abs` | Abs | Rectus abdominis | F 4, 5, 22, 23, 26, 27, 34, 35 |
| `obliques` | Obliques | External oblique | F 10, 11 |

### Legs
| id | name | scientific | paths |
|---|---|---|---|
| `gluteMax` | Glute Max | Gluteus maximus | B 21, 22 |
| `gluteMed` | Glute Med | Gluteus medius | B 23, 24 |
| `rectusFemoris` | Rectus Femoris | Rectus femoris | F 14, 15 |
| `vastusLateralis` | Outer Quad | Vastus lateralis | F 0, 1 |
| `vastusMedialis` | Teardrop | Vastus medialis | F 56, 57 |
| `sartorius` | Sartorius | Sartorius | F 36, 37 |
| `adductors` | Adductors | Adductor group | F 20, 21, 38, 39 · B 9, 10, 11, 12 |
| `hamsOuter` | Outer Hamstring | Biceps femoris | B 15, 16, 17, 18 |
| `hamsInner` | Inner Hamstring | Semitendinosus / semimembranosus | B 7, 8, 13, 14 |
| `gastrocnemius` | Calf | Gastrocnemius | B 19, 20 · F 8, 9 |
| `soleus` | Soleus | Soleus | B 5, 6 · F 24, 25 |
| `tibialis` | Shin | Tibialis anterior | F 48, 49, 54, 55 |

Head, face, neck, hands and feet stay untagged — not trainable, they render in
the neutral baseline colour.

`F` = `features/body/front.tsx` path index, `B` = `features/body/back.tsx`.
Indices are path document order, the same numbering `body-map.test.ts` counts.
Paths not listed keep the neutral fill; the count assertion in that test needs
updating to the new totals.

---

## Populating 30 ids from a dataset that knows 19

`public/exercises.json` tags each exercise with one coarse `target` (`pectorals`,
`delts`, `calves`…) plus a `secondary` list. It cannot name most of the above:
`upper chest` appears 3 times in 1324 exercises, `soleus` 4 times.

Two mechanisms, in order:

1. **Name heuristics** in `deriveEngagement` — `incline` → `pecUpper`,
   `decline`/`dip` → `pecLower`, `lateral raise`/`upright row` → `deltSide`,
   `rear delt`/`reverse fly`/`face pull` → `deltRear`, `seated calf` → `soleus`,
   `reverse curl` → `forearmExtensors`, overhead/skullcrusher → `tricepsLong`,
   pushdown → `tricepsLateral`, abduction → `gluteMed`. Measured coverage:
   76 incline, 65 decline/dip, 43 front-delt, 41 side-delt, 23 rear-delt.
2. **Even split across the group** when no rule matches — a flat bench press
   engages both pec heads, a squat engages all three quad heads. This is
   anatomically right, and it guarantees no id is ever permanently dark.

Sub-head percentages are therefore **inferred, not read from the dataset**. The
Build screen already allows per-muscle engagement editing, so anything wrong is
correctable by hand.

## Legacy data

Logged workouts, session templates and the stored `selectedMuscleId` carry the old
10 ids. `resolveMuscleId` gets forward aliases so history keeps rendering:
`chest` → both pec heads, `shoulders` → all three delts, `back` → lats + traps +
rhomboids + erectors, `calves` → gastroc + soleus, `quads` → the three vasti +
rectus femoris, `hamstrings` → both heads, `glutes` → max + med, `core` → abs +
obliques, `triceps` → both heads. No migration script, no data rewrite.

---

## Tracks

**A — taxonomy core.** `lib/types.ts` (30-wide `MuscleId`), `lib/seed-data.ts`
(30 entries with `name`, `scientific`, `group`), `lib/exercises.ts` (extend
`MUSCLE_MAP`, add heuristics + even-split to `deriveEngagement`),
`body-map-shared.ts` (legacy aliases).

**B — body map.** Re-tag `data-muscle` on both SVGs per the path table above
(strip existing tags first — the injector skips already-tagged paths). One CSS
rule per id in `globals.css`; `body-map.test.ts` gains an assertion that every
`MuscleId` has a matching rule, since a missing rule silently reads as "never
worked". Re-render the colour-coded proof and eyeball it before shipping.

**C — exercise media popup.** `lib/exercises.ts` already has `exerciseImageUrl` /
`exerciseGifUrl` against the upstream CDN. `WorkoutTemplate` gains `dbId?: string`
so Home can join a planned exercise to its dataset entry (today `dbId` lives only
in the builder's local state; template ids are `db-0001`, so old templates resolve
by stripping the prefix). Shared `<ExerciseMediaDialog>` used by the Build card and
the Home ledger row. The asset is an animated **GIF** — `<img>`, not `<video>`.

**D — muscle picker drawer (Build).** `features/planner/muscle-drawer.tsx`. Body
map on top, activation slider in the middle, chips grouped by region below. The
focused muscle glows on the figure via a per-muscle `--g-<id>` filter slot, so
"which muscle is that?" is answered by pointing at it. Rendered as a *view inside*
the builder sheet, not a nested dialog — `exercise-picker.tsx` documents the
stacked-modal focus/pointer-events problem that pattern avoids.

`features/home/body-viewer.tsx` and `body-viewer-lazy.tsx` are still dead code —
nothing imports them. Safe to delete.

## Known limits

- **30 chips is a lot on a phone.** The drawer groups them under the six region
  headings and the Build card itself shows only a summary line
  ("Upper Chest, Front Delt +3"). If it still feels heavy in use, the fix is a
  search field in the drawer, not fewer muscles.
- **Front-view forearms are mostly untagged.** Their paths interleave with the
  hand shapes, so nearest-anchor assignment pulls them into the hand. Forearms
  light up correctly on the back view; the front stays neutral for them.
- **Sub-head engagement is inferred**, per the heuristics above — not read from
  the dataset, which cannot express it.
