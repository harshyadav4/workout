# Plan page — UI/UX review

Static review of `app/(app)/plan/page.tsx` → `features/planner/{plan-dashboard,plan-build,plan-schedule,exercise-picker,muscle-drawer}.tsx`.
Method: `ui-ux-pro-max` (`--domain ux`, `--domain web`, `--stack nextjs`, `references/pro-rules.md`),
plus measured WCAG contrast on the actual tokens and a `tailwind-merge` run against the real
`Button` class string.

Unlike Home there is **no `plan-plan.md` brief** to measure against, so this measures against three
things instead: the skill's priority table (accessibility → touch → forms → navigation), the design
decisions Home already locked in (44px floor, ink-on-colour, `Button` for anything tappable), and
whether the screen's own claims hold. Where a fix is global rather than page-local it says so.

Contrast figures are computed from `globals.css` HSL tokens, not eyeballed, and are **pre-fix** —
they are what the fix was measured against.

**Status (2026-08-05): applied.** Done: #1–#3, #5–#20, #22–#27, #29, #30, plus the Home CTA now
pointing at `/plan?mode=build`. `npx tsc --noEmit`, `npm run check` (8 suites) and `npm run build`
all pass, and `/plan` still prerenders static. Post-fix measurements: accent pair **2.51 → 7.20:1**;
`.text-danger-foreground` now emits a real rule in the built CSS (`hsl(var(--danger-foreground))`)
so the destructive confirms read **5.26:1** instead of falling through to 3.44:1.

Deliberately **not** applied, with reasons:
- **#4, day cells** — accepted as recommended. 44px is geometrically impossible at 360px; every
  other row in that table was fixed.
- **#21, Android back gesture** — the ✕ is now hidden while a sub-view is open, but the `popstate`
  guard that stops the gesture leaving `/plan` with an unsaved draft is a larger change than this
  pass. Still open.
- **#28** — a note, not a defect.
- **#29, `plan-build.tsx:429`** — ruled borderline in the finding itself; the two state-carrying
  drawer labels were changed, this one and the decorative group headers were left.

One tradeoff the #13 fix makes, stated rather than implied: the day-adder now renders **one chip per
template, always visible**, where the `<select>` cost a fixed amount of space at any count. Rotation
mode gets away with the same pattern because its list *shrinks* as you add; the day-adder's can't,
since a template can sit on many days. At 4–6 templates this is two rows and clearly better; past
~10 it wants a cap or a sheet. Not capped now — no one has ten splits — but it is the one place on
this screen that degrades with data instead of improving.

## Critical

| # | Location | Problem | Smallest fix |
|---|---|---|---|
| 1 | `dialog.tsx:33` | **The dialog close button has no accessible name.** It is icon-only, and lucide auto-applies `aria-hidden="true"` when no a11y prop is passed (`node_modules/lucide-react/dist/cjs/lucide-react.js:64`, verified in the Home pass) — so the `<X>` contributes nothing and the button announces as "button". The skill's `web` domain rates this **Critical** by name. /plan is the dialog-heavy screen: builder, picker, muscle drawer, media view, remove-from-day, delete-template, replace-schedule — **seven flows, all ending at this one nameless control.** It is also 32×32 (see #4). | `aria-label="Close"`. **Global** — one attribute, every dialog in the app. |
| 2 | `globals.css:23` + `plan-schedule.tsx:446` | `--accent-foreground` (near-white) on `--accent` cyan = **2.51:1**. This is the same bug that was already fixed for `--primary`, still live on `--accent`. It renders on the rest-day weekday toggles — the selected state of a 7-button row. | `--accent-foreground: 212 42% 7%` → **7.20:1**. Safe as a global flip, by the same argument the primary comment makes: `grep -rn "accent-foreground\|bg-accent\|text-accent"` returns exactly **one** `text-accent-foreground` site (this one) and it pairs with solid `bg-accent`; every other accent use is `text-accent` on a translucent tint (`home-dashboard.tsx:49,255,258`). |
| 3 | `plan-schedule.tsx:526`, `plan-build.tsx:627` | **`text-danger-foreground` does not exist.** No such key in `globals.css` or `tailwind.config.ts` (which defines `danger` but no `danger-foreground`), so Tailwind emits nothing for it — but `tailwind-merge` still treats it as a text-colour class and **strips `text-primary-foreground` off the `Button` base**. Verified by running the real class string through `cn()`: the output contains `bg-danger text-danger-foreground` and no `text-primary-foreground`. The text falls back to inherited `--foreground`: near-white on red = **3.44:1**. Both destructive confirmations on this page — "Remove" and "Delete" — are the buttons that fail. | Add `--danger-foreground: 212 42% 7%` to `globals.css` and `danger-foreground` to the Tailwind colour map → **5.26:1**. Mirrors the primary decision and makes the class real instead of inert. **Global**: these are the only two call sites today, so the token can't regress anything. |
| 4 | *table below* | **Twelve control types below the 44×44 floor**, four of them at 24px. As on Home, the failures are exactly the controls that bypassed `Button` — every `Button` and `Input` on the page is `h-12` and passes. | Per row below. |
| 5 | `plan-schedule.tsx:294,368`, `exercise-picker.tsx:105`, `plan-build.tsx:502` | **`outline-none` with no replacement focus ring** on three `<select>`s and the notes `<textarea>`. This is §1's anti-pattern by name ("removing focus rings") and fails WCAG 2.4.7 — keyboard users lose the caret entirely on the weekday assignment selects, which are the primary control of Fixed-weekly mode. | Add `focus-visible:ring-2 focus-visible:ring-ring`, matching `input.tsx:10`. |
| 6 | `input.tsx:10` | **`text-sm` (14px) on `Input` now triggers iOS focus-zoom.** Safari zooms the viewport on focus for any input under 16px and does not zoom back out. This was masked by `maximumScale: 1` until Home's finding #18 correctly deleted it — the a11y fix traded a zoom lock for a zoom trap, and /plan is where it bites: the builder has six inputs per exercise card (name, sets, reps, weight, rest, notes) plus per-set weights, so adding one exercise means six zoom-and-pan cycles. | `text-base` on `Input`, and on the `textarea` at `plan-build.tsx:502`. **Global**, and it is the single most disruptive thing on this screen. (`<select>` and `type="date"` open a picker wheel instead of zooming — see *Needs eyes*.) |

### 4 — touch targets, measured

| Location | Control | Size | Fix |
|---|---|---|---|
| `plan-build.tsx:379` | "Remove" exercise | **24px tall** | `Button variant="secondary" size="sm"` (h-10) or `py-3` |
| `plan-build.tsx:549,557` | Edit + Delete icon buttons, `gap-2` apart | **24×24 each** | `p-3`; Edit adjacent to Delete at 24px is a mis-tap into a destructive dialog |
| `plan-schedule.tsx:279`, `:407` | Remove-session ✕, remove-rotation ✕ | **24×24** | `p-3` or `min-h-11 min-w-11` |
| `plan-dashboard.tsx:27` | **Build / Schedule** — the page's primary mode switch | **36px tall** | `py-3` (44px) |
| `plan-schedule.tsx:191,208` | Week ◀ ▶ arrows, `gap-1` = 4px apart | **32×32**, 4px gap | `p-3` + `gap-2`; fails size *and* spacing |
| `plan-schedule.tsx:199` | "Today" | **32px tall** | same row, same fix |
| `plan-schedule.tsx:294,368`, `exercise-picker.tsx:105` | The three `<select>`s | **36px tall** | `py-3` |
| `plan-schedule.tsx:429` | Rotation add-chips | **36px tall** | `py-3` |
| `plan-schedule.tsx:445` | Rest-day weekday toggles (7) | **32px tall** | `py-3` |
| `plan-build.tsx:473` | "Weight per set" `<summary>` | **36px tall** | `py-3` |
| `exercise-picker.tsx:73` | Back arrow | **32×32** | `p-3` |
| `exercise-picker.tsx:148` | FilterChip (horizontal scroller) | **28px tall** | `py-3` |
| `muscle-drawer.tsx:172` | **Muscle chips — 30 of them**, the drawer's whole selection surface | **32px tall** | `py-3`; see *Needs eyes* for wrapping |
| `muscle-drawer.tsx:81` | "Back" (text + icon, no padding) | **20px tall** | `py-2 -my-2` or make it a `Button variant="ghost"` |
| `muscle-drawer.tsx:147` | "Add {muscle}" | **32px tall** | `py-3` |
| `muscle-drawer.tsx:133` | Activation `<input type="range">` | native thumb ≈20px | `h-11` on the input, thumb styling optional |
| `dialog.tsx:33` | Close ✕ (**global**) | **32×32** | `p-3`, same edit as #1 |
| `plan-schedule.tsx:223` | Day cells | 50px wide at 448 — **37px at 360** | **No padding fix reaches 44** — see below |

Passing: every `Button` (h-12/h-14), every `Input` (h-12), the day cells' *height* (~71px), BottomNav (min-h-16).

**The day-cell row is a constraint, not a defect.** 44 × 7 = **308px**, and the content box at a
360px viewport is **296px** (360 − 32 page `px-4` − 32 Card `p-4`) even at `gap-0`. The 7-column week
grid cannot meet the 44px *width* floor below ~400px, so no padding tweak fixes it — `gap-1` instead
of `gap-1.5` recovers 1.7px per cell (37.1 → 38.8), not enough to matter. Three honest options:
drop the Card's `p-4` to `px-2` for this card only (→ 42.3px, still short but close), let the strip
scroll horizontally, or **accept it** — the cell is ~71px tall, which is what actually carries the
target, and a mis-tap only selects the neighbouring day. Recommend accepting it and spending the
edit on the 24px destructive buttons instead.

### 7 — press feedback

`globals.css:40` sets `-webkit-tap-highlight-color: transparent`, so the OS flash is gone. On Home
that left three controls with no touch confirmation (finding #19). On /plan it is **every hand-rolled
control on the page** — only `Button` has `active:scale-[0.98]`:

| Location | Current |
|---|---|
| `plan-dashboard.tsx:27` | `transition` only — no active state on the mode switch |
| `plan-schedule.tsx:228` | `hover:bg-secondary/70` — never fires on touch |
| `plan-schedule.tsx:191,199,208` | nothing |
| `plan-schedule.tsx:279`, `:407` | `hover:bg-background hover:text-danger` — hover-only |
| `plan-schedule.tsx:429,445` | nothing |
| `plan-build.tsx:379,549,557` | `hover:` only, or nothing |
| `exercise-picker.tsx:73,148,160` | nothing |
| `muscle-drawer.tsx:81,147,172` | `transition-colors` only |

One fix pattern: `active:bg-secondary/60` on the surfaces, `active:scale-95` on the icon buttons.
Stacks with the touch-target edits above — same lines, one pass.

## High — the forms

| # | Location | Problem | Smallest fix |
|---|---|---|---|
| 8 | `plan-build.tsx:437-468` | **Four unlabelled number inputs in a 2×2 grid, and the placeholders never render.** `createEmptyExercise()` pre-fills sets 3, reps 10, weight 20, rest 75 — so `placeholder="Sets"` / `"Reps"` / `"Weight"` / `"Rest seconds"` are dead code from the first paint. What you see is `3 10 / 20 75` in a square with nothing telling you which is which, and no unit on the weight. §8's "placeholder-only label" anti-pattern, in its worst form: the placeholder isn't even a fallback. | Visible `<label>` above each field, as `plan-schedule.tsx:314` already does for Start/End. Add `kg` / `s` suffixes. |
| 9 | `plan-build.tsx:442,449,457,466` + `:248-280` | `Number(event.target.value)` on an emptied field yields **`0`**, and `saveSession` never clamps — `min={1}` is a browser hint, not validation, and nothing calls `checkValidity()`. Clear the sets field and save: the template stores `sets: 0`, `buildSessionSummary` computes a zero session, and it gets scheduled onto real days. Also silently collapses the per-set weight panel (`exercise.sets > 1`). | Clamp on write: `Math.max(1, Number(...) \|\| 1)` for sets/reps, `Math.max(0, …)` for weight/rest. Boundary validation, not polish. |
| 10 | `plan-build.tsx:514` | **The error renders at the bottom of a scrolling dialog; the field it's about is at the top.** "Name your session." appears above Save, while the name `Input` is at `:368` — with three exercise cards between them inside `max-h-[88vh] overflow-y-auto`, the user is told what's wrong at the one position where they cannot see the thing that's wrong. Same for "Each exercise can only appear once" (which doesn't say *which* one). | Error under the name field for name errors; name the duplicate in the message. |
| 11 | `plan-schedule.tsx:363-377` | The seven weekday `<select>`s have **no accessible name.** The `<span>Mon</span>` at `:364` is a sibling, not a `<label>`, and there is no `aria-label` — a screen reader announces seven identical unlabelled comboboxes. The sibling `<select>` at `:291` gets this right with an `aria-label`. | `aria-label={`Workout for ${label}`}`. |
| 12 | `plan-build.tsx:377-386` | The builder's "Remove" is `disabled` on the last exercise but is a **bare `<button>` with no `disabled:` classes** — no opacity change, no cursor change, nothing. It looks identical whether it works or not, so the first exercise card reads as broken rather than protected. (`Button` has `disabled:opacity-50`; this control bypassed it.) | Use `Button`, or add `disabled:opacity-40`. |
| 13 | `plan-schedule.tsx:291-303` | A `<select>` used as an **action trigger**, not a value control: `value=""` always, and the first option is the instruction "+ Add a session to this day". On iOS this opens a wheel whose top entry is a no-op you can "pick". A select answers "which one is it?"; this is asking "do this". | A `Button` opening the same list as a sheet — the page already has the drawer pattern for exactly this. |
| 14 | `plan-build.tsx:316-322` | The hero's marketing copy — "Build a session once, reuse it forever" plus two lines of explanation — **never goes away.** `hasPlan` changes only the button label. With five saved sessions it still occupies the top of the screen and pushes "Your sessions" below the fold, on the mode you're in to *manage* sessions, not to be sold them. | Collapse to the button alone when `hasPlan`. The onboarding copy has done its job by then. |

## Medium

| # | Location | Problem | Smallest fix |
|---|---|---|---|
| 15 | `plan-schedule.tsx:497`, `:162`, `:517`, `:504` | **Raw machine values in user-facing copy** — "2026-08-12" under every Upcoming row, "through 2026-09-30" in the confirmation, "taken off 2026-08-12" in the remove dialog, and at `:504` a raw lowercase enum (`planned` / `completed`) rendered directly into the status pill beside them. | `formatDayKey` already exists in `lib/progress-metrics.ts` and is used across the whole Progress screen — one import. The status pill needs a label map, not `capitalize`; "planned" and "completed" are the internal names, not necessarily the words to show. |
| 16 | `plan-dashboard.tsx:16` | Mode is `useState`, not URL state — `/plan` **always opens on Schedule**, and there's no `?mode=build` to link at. Home's empty state sends "Create a session" to `/plan`, which lands on the wrong half; `onGoBuild` exists precisely because the handoff is needed. Deep linking is a §9 must-have. | `useSearchParams` + `router.replace`, and point Home's setup CTA at `/plan?mode=build`. Interacts with Home finding #10. |
| 17 | `plan-build.tsx:338-521` | The builder's **Save is at the bottom of an 88vh scroll container**, below every exercise card. Six exercises means scrolling past all of them to commit — and the same scroll hides the error from #10. | Sticky footer: `sticky bottom-0` on the Save row with the dialog's own background. |
| 18 | `plan-schedule.tsx:460` | "Generate schedule" is disabled with **no reason given**. `canGenerate` needs both an assignment and a valid range; the helper text underneath talks about something else entirely ("Replaces planned days"). A user with an inverted date range sees a dead button and no cause. | Swap the helper line for the blocking reason while disabled. |
| 19 | `plan-schedule.tsx:245` | Session names in the day cells are **`text-[9px]`** — the smallest type in the app, below the 12px body floor (§6), truncated, and it is the only place the week grid says *what* is planned. The "Rest" pill at `:241` is the same size. Contrast is fine (**4.71:1** and **7.35:1**); the size isn't. | `text-[11px]`, or drop to a coloured dot and let the selected-day detail row below carry the name — it already does. |
| 20 | `exercise-picker.tsx:87` | `autoFocus` on the search input **pops the keyboard on open**, covering the body-part filter row and most of the results — the two things you'd use if you didn't want to type. | Drop `autoFocus` on touch, or focus only when the list is already filtered. |
| 21 | `plan-build.tsx:339-360` + `dialog.tsx:33` | The sub-views (picker / muscle / media) render **two competing dismiss affordances**: their own back arrow, and the dialog's absolutely-positioned ✕ still sitting at `right-4 top-4` over their header. Back goes up one level; ✕ discards the whole builder. **Android's back gesture does neither** — Radix pushes no history entry, so it navigates off `/plan` entirely and takes the unsaved draft with it, no confirm. | Hide `DialogClose` while a sub-view is open. The back-gesture trap is a separate, larger fix (a `popstate` guard) — flagging, not proposing. |
| 22 | `exercise-picker.tsx:126` | `max-h-[46vh] overflow-y-auto` **nested inside** the dialog's own `overflow-y-auto` (`plan-build.tsx:338`). Two touch scroll containers, one inside the other — the inner list swallows the drag and the outer one only moves once it hits the end. | Let the dialog scroll; drop the inner cap. |
| 23 | `plan-schedule.tsx:342`, `exercise-picker.tsx:145`, `plan-schedule.tsx:443`, `:223` | **`aria-pressed` is missing** on the Fixed-weekly/Rotation toggle, the FilterChips, and the rest-day toggles; the selected day has no `aria-current`. `plan-dashboard.tsx:25` and `muscle-drawer.tsx:170` both get this right — so the page contradicts itself. | `aria-pressed` on the toggles, `aria-current="date"` on the selected day. |
| 24 | `page.tsx:6` → `plan-dashboard.tsx:20` → `plan-build.tsx:317` | **Three titles before the first control**: "Plan / Builder and scheduler", then the segmented control, then "Session builder / Build a session once…". On a 640px phone the actual builder button is the fourth thing down. | Falls out of #14. |

## Low

| # | Location | Problem |
|---|---|---|
| 25 | `plan-schedule.tsx:185` | `week -1` / `week +2` as a heading. Nobody reads a calendar in signed offsets — "last week", "in 2 weeks", or just the date range. |
| 26 | `plan-build.tsx:315-316` | `rounded-[28px]` inside `Card`'s `rounded-[28px]` with `p-4` between them. Concentric radii need the inner one *smaller* (28 − 16 = 12) or the corners read as misaligned. |
| 27 | `plan-build.tsx:566-575` | The exercise chips inside `<summary>` are `rounded-full bg-background px-3 py-2` — they look exactly like the tappable chips at `plan-schedule.tsx:429` and `muscle-drawer.tsx:172`, but tapping one toggles the disclosure. Same shape, different behaviour. |
| 28 | `exercise-picker.tsx:123` | "N found · showing first 40" with no way to reach 41+ except refining the query. Honest, but a dead end on a broad filter. |

## What holds up

- **The sub-view pattern.** Picker, muscle drawer and media all render *inside* the builder dialog
  instead of stacking modals, with the reason written down at `exercise-picker.tsx:23-24`. The
  stacked-modal focus trap is a real bug that this deliberately doesn't have.
- **Both destructive actions are gated, and the copy states the blast radius precisely** — including
  that deleting a template leaves already-scheduled workouts alone. `plannedCount` is deliberately
  scoped to `[startDate, endDate]` with a comment explaining why counting outside it would lie.
- **The silent no-op is surfaced** (`:85-88`): re-adding the same session says "already on this day"
  instead of appearing broken. That's the failure mode most schedulers ship with.
- **The store/UI normalization mismatch is handled** (`plan-build.tsx:302-307`): a write the store
  rejects keeps the drawer open with the error rather than closing and dropping the edit.
- **Every empty state is real** — no templates hands off to Build with a working callback, no
  rotation order explains the fallback, the picker handles its own load failure.
- `changeWeek` returns you to today whenever the week contains it (`:69-76`) — stepping away and back
  lands where you started.
- `seeded` ref seeds the form from a saved config exactly once, so hydration doesn't fight edits.
- The muscle drawer's focused panel — scientific name, description, live activation — makes the map
  answer "which one is that?" instead of being decoration.
- Most hand-rolled icon buttons already carry `aria-label`. The planner is above average here; the
  one that's missing is the *shared* component (#1), not a planner control.

## Second pass — applying Home's already-decided rulings

Home settled two questions that /plan was never re-checked against. Both are rulings, not new
opinions, so these are cheap:

| # | Location | Problem | Smallest fix |
|---|---|---|---|
| 29 | `plan-build.tsx:429`, `muscle-drawer.tsx:114,130,159` | **Four more `text-[10px]` at `0.22em`–`0.28em` tracking**, unreviewed by Home #9. That finding's rule was: state-carrying labels go to `text-xs`, decorative ones may stay. Sorting these — **state-carrying:** `muscle-drawer.tsx:114`, the scientific-name readout that *is* the map's answer to "which muscle is that?", and `:130` "ACTIVATION", which labels the slider; **borderline:** `plan-build.tsx:429` "MUSCLES WORKED", which labels a control whose value sits right beside it; **decorative:** `:159` group headers. | The first two to `text-xs` at `0.14em`, per Home #9. (`plan-schedule.tsx:232`'s weekday initials are 10px but at `tracking-wide`, not the wide tracking Home #9 was about — checked, ruled decorative, left alone.) |
| 30 | `muscle-drawer.tsx:95` | **`bg-[#08111d]` hardcoded** where `bg-background` exists. Home #11 tokenized exactly this surface in `muscle-map-card.tsx` and is marked Done — the drawer's copy of the same body-map panel was missed. Two body-map surfaces, one on tokens and one on a raw hex, is the drift #11 was fixing. (The cream `#F7ECD9` at `:97,105` is deliberate per Home's brief and stays.) | `bg-background`. |

## Needs eyes — not statically checkable

- **30 muscle chips at 44px.** Fix #4 makes the drawer's chip grid ~40% taller. It may need two
  columns, or the group sections may need to collapse.
- **iOS `<select>` and `<input type="date">` under fix #6.** These open picker wheels rather than
  zooming, so 14px is probably safe there — but the date inputs sit in the same grid as text inputs
  and will look inconsistent once `Input` goes to 16px. Worth one device check before deciding
  whether the change is `Input`-wide or text/number-only.
- Day-cell pills at 360px with real session names — "Upper Body Push" in a 37px column.
- The builder drawer at `max-h-[88vh]` with 6 exercise cards, once every control grows to 44px.
- The gradient hero (`from-primary/20 via-card to-accent/10`) against the body's orange radial.
- Whether "Generate schedule" reads as safe. It replaces days silently when `plannedCount === 0`.

/plan sits behind the Supabase guard like Home, so this needs real credentials or a temporary bypass.
`! npm run dev` when you want to walk Build and Schedule.
