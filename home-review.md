# Home page — UI/UX review

Static review of `app/(app)/page.tsx` → `features/home/{home-dashboard,exercise-ledger,muscle-map-card}.tsx`
against the brief in `home-plan.md`: *the screen you hold at arm's length between sets, one hand,
sweaty, during a 90-second rest*. Method: `ui-ux-pro-max` (`--domain ux`, `--domain web`,
`references/pro-rules.md`) plus measured WCAG contrast on the actual tokens.

**Status (2026-08-05): the colour + contrast + touch-target subset is now applied.**
Done: #1, #2, #3, #4, #5, #9 (partial — the two state-carrying labels only, decorative 10px left as
the finding allowed), #11, #15, #16, #17, #18, #19, plus the
`app-safe-bottom` amendment, plus per-state hues on the day tag and a fill bar in the header.
Still open — all behaviour changes, not colour: **#6** (media-dialog tap target, different file),
**#7** ("last" is showing the plan), **#8** (map sits below the ledger while logging), **#10**
(duplicate `/plan` affordance), **#12** (Finish session weight), **#13** (`NextUp` two weights),
**#14** (rest clock). Contrast figures below are pre-fix; they are what the fix was measured against.

Contrast numbers are computed from `globals.css` HSL tokens, not eyeballed.

## Critical — the signature interaction fails its own brief

> See also **#18** in the second pass below — `maximumScale: 1` in `app/layout.tsx` disables
> pinch-zoom. Higher severity than anything in this table; it surfaced on the checklist pass, after
> this section was written, and is one deleted line.

| # | Location | Problem | Smallest fix |
|---|---|---|---|
| 1 | `exercise-ledger.tsx:95` | `SetChip` button is `h-9 w-7` — **36×28px**. This is *the* tap target of the page ("tap any chip to go back and fix it"), and it's the smallest thing on screen. Minimum is 44×44. | `h-11 w-11` |
| 2 | `exercise-ledger.tsx:150` | Chips sit at `gap-1` = **4px** apart. Adjacent touch targets need ≥8px, more so one-handed and sweaty. | `gap-2` |
| 3 | `globals.css:13` | `--primary-foreground` (near-white) on `--primary` orange = **2.78:1**. Fails 4.5:1 on *every* primary control on this screen: Log set (`exercise-ledger.tsx:199`), Start session, Finish session, Create a session, active session pill (`home-dashboard.tsx:277`). | `--primary-foreground: 212 42% 7%` (`#0a1119`) → **6.51:1**. Safe as a global flip: `grep -rn "primary-foreground" app components features` returns 10 call sites and every one of them is paired with `bg-primary`, so nothing renders it on a dark surface. |
| 4 | `exercise-ledger.tsx:97` + `76-82` | Pending chip is `bg-secondary` on the glass card = **1.34:1**. The hollow half of the `▮▮▮▯▯` tally is effectively invisible, so the ledger only reads in one direction. Graphical objects need 3:1. | `bg-white/20` or add `ring-1 ring-white/25` |
| 5 | `muscle-map-card.tsx:68,79` | `text-slate-400` on the cream `#F7ECD9` panel = **2.19:1**. The "Front" / "Back" labels. | `text-slate-600` (7.0:1) |
| 6 | `exercise-media-dialog.tsx:154` | Demo-video trigger is `p-1.5` around a `h-4 w-4` icon = **28×28px**, and it sits inline next to the exercise name where a mis-tap opens a modal mid-set. | `p-3`, or `min-h-11 min-w-11` |

Steppers (`h-11 w-11`), Log set (`h-12`), Buttons (`h-12`/`h-14`) and BottomNav (`min-h-16`) all pass.
The failures are exactly the two controls that were hand-rolled instead of using `Button`.

## High — the screen says things that aren't true

| # | Location | Problem | Smallest fix |
|---|---|---|---|
| 7 | `exercise-ledger.tsx:172` | `last {previousWeight}kg × {previousReps}` — but `workout-helpers.ts:224-225` sets both to *today's planned* weight/reps at session build, and nothing ever writes them from logs. `plannedExercisesFromTemplate` is the only construction path (`workout-store.tsx:106`, and injected into `buildScheduleSessions` at `:396`), so this holds for every session. The line labelled "last" is showing you the plan you're looking at. On session 1 it is meaningless; on session 20 it is still meaningless. | Relabel to `target`, or feed `previousWeight` from the last matching log. Relabel is the honest one-liner; the label is what's lying. |
| 8 | `home-dashboard.tsx:133-143`, `340-354` | While `logging`, the map narrows to the lift you're on and the caption says "Following the set you are on" — but the map sits *below* the full ledger, twin `16.5rem` panels down. You cannot see the thing that's following you while you tap. The feedback loop is broken by distance, not by logic. | Collapse the map to a single small strip while `logging`, or move it above the ledger in that state only. Leave the other five states alone. |
| 9 | `exercise-ledger.tsx:31`, `home-dashboard.tsx:55,77`, `muscle-map-card.tsx:23,26,32,68,79` | **10px uppercase at `0.22em`–`0.3em` tracking, nine instances.** Wide tracking at 10px is a poster technique, not an arm's-length one, and two of these carry state you need mid-set: the day tag ("In progress" / "Ready" / "Complete") and the stepper labels ("Weight" / "Reps"). | Those two to `text-xs` (12px) with tracking down to `0.14em`. The decorative ones (Front/Back, legend) can stay small. |

## Medium

| # | Location | Problem | Smallest fix |
|---|---|---|---|
| 10 | `home-dashboard.tsx:223` + `:226` | The `open` state gives two controls to `/plan` inside one card — the `NextUp` row and "Schedule a session". Same destination, two affordances, one card. | Drop the button; `NextUp` already links there. Or make `NextUp` static text in this state. |
| 11 | `muscle-map-card.tsx:65,23,26,32` | Hardcoded `#08111d` and `text-slate-400` where tokens exist. (`#F7ECD9` is deliberate per the brief — these two aren't.) | `bg-background` and a token'd muted. |
| 12 | `home-dashboard.tsx:333` | "Finish session" is a full-width primary button with no confirm and no visible undo, one thumb-width below the ledger you're actively tapping. Mis-tap ends the session and writes the log. | `variant="secondary"` until the last chip fills — it earns primary weight when it's actually the next action. **Do not** gate it on `totals.done > 0`: `buildLogFromSession` deliberately treats an unmarked session as the whole plan ("finished without tapping through set by set, and it is still work done"), and a gate would delete that path. |
| 13 | `home-dashboard.tsx:338` | In `done`, `NextUp` renders bare between two cards; in `open`/`rest` the same component sits inside a card. Same element, two visual weights. | Wrap it, or unwrap the others. |
| 14 | `exercise-ledger.tsx:145` | The brief's type direction and wireframe both name a **rest clock**; `restSeconds` renders as static text (`· 90s rest`). Not a bug — a promise the screen doesn't keep. Flagging, not proposing. | — |

## Low

| # | Location | Problem |
|---|---|---|
| 15 | `home-dashboard.tsx:57` | `text-[2rem]` session title has no `truncate` / `break-words` — `NextUp:80` truncates, this doesn't. A long template name will wrap into the detail line or overflow. |
| 16 | `exercise-ledger.tsx:76-82` | Done vs pending is conveyed by fill colour alone. `aria-label` covers screen readers; sighted users get colour only. Fix #4 (a ring on pending) resolves this as a side effect. |
| 17 | `home-dashboard.tsx:269` | Multi-session pills are `h-auto` (`py-2 text-xs` ≈ 32px tall) in a horizontal scroller with no scroll affordance. Ranked Low, not Critical like #6 at a comparable 28px, because it only renders on 2+ sessions in one day and a mis-tap just switches session — frequency and blast radius, not size. |

## What holds up

Worth saying, because a review that only lists faults misreads the screen:

- The state machine is right. Six states, one resolver, no `?.` soup in the view — `open` and `rest`
  render real content instead of the dead screen the plan describes.
- Exactly one set open at a time, session-wide, with the picked-set fallback to
  `firstPendingSetId` — this is the correct interaction for the brief and it's implemented cleanly.
- One motion moment, scoped to `stampedSetId` so it plays on tap and nowhere else, behind
  `prefers-reduced-motion`. The restraint is the achievement.
- Focus rings on every interactive element. Nothing removes an outline.
- `formatDay` parses and formats in UTC — the date can't shift under a timezone.
- Mono numerals with the unit as a small suffix: the numbers carry the personality, as briefed.

## Second pass — Step 4 (stack) + Pre-Delivery Checklist

Run after the first pass: `--stack nextjs`, `references/quick-reference.md` §1–§3, and the canonical
checklist in `references/pro-rules.md`. Two new findings, both outside the files reviewed above.

| # | Location | Problem | Smallest fix |
|---|---|---|---|
| 18 | `app/layout.tsx:32` | **`maximumScale: 1` disables pinch-zoom.** This is the §5 anti-pattern by name ("Disable zoom") and fails WCAG 1.4.4 Resize Text. It also lands hardest on exactly this screen: 10px tracked labels (finding 9) that a user can no longer zoom into. Highest severity found — one deleted line, affects every page. | Delete `maximumScale: 1`. iOS has not needed it since iOS 10. |
| 19 | `home-dashboard.tsx:75,275`, `exercise-ledger.tsx:95` | **No press feedback on touch.** These three rely on `hover:` (never fires on touch) or nothing at all, while `globals.css:34` sets `-webkit-tap-highlight-color: transparent` — so the OS default flash is gone too. Tapping a set chip with sweaty hands gives zero confirmation the tap registered. | `active:bg-secondary/60` on the link and pills; `active:scale-95` on the chip, matching the steppers. **Chip fixes stack** — #1 (`h-12 w-12`), #4 (ring on pending), #16 (same ring), #19 (active state) are one edit to `SetChip`, not four passes. |

Amendment to finding **#1**: `h-11` (44px) clears iOS but Android's floor is 48dp. Since you're
touching the line anyway, `h-12 w-12` costs nothing and clears both.

Amendment to finding **#12** neighbourhood: `app-safe-bottom` is `env(safe-area-inset-bottom) +
5.5rem` = 88px, and the nav measures `min-h-16` + `pt-3` + `pb-3` = 88px. Exactly flush — the last
card's edge meets the nav's border with zero breathing room. Not hidden, just airless. `6.5rem`.

**Checked and clear** — stating these so the checklist reads as run rather than skimmed:

- Icon labels: lucide-react auto-applies `aria-hidden="true"` when no a11y prop is passed
  (`node_modules/lucide-react/dist/cjs/lucide-react.js:64`). Every decorative icon on Home is
  covered. Not a finding.
- Modal scrim: `dialog.tsx:24` is `bg-black/60` — inside the 40–60% band.
- No hydration flash of the `setup` state. `AuthGuard` renders its loading card on both the server
  and the first client render, so by the time Home mounts, `loadState()` has already read
  localStorage. The `setup` state can't flash past a user who has a plan.
- Press feedback on steppers (`active:scale-95`) and all `Button` variants (`active:scale-[0.98]`) —
  transforms don't reflow, so no layout-shift jitter.
- `page.tsx` is a Server Component with the client leaf below it, per the Next.js rule.
- No horizontal scroll: `max-w-md` + relative units throughout.

One architectural note, not a fix: `AppProviders` is `"use client"` in the root layout, so "push
Client Components down" is moot — every page is fully client-rendered. That falls out of AuthGuard +
zustand + next-themes and isn't worth unpicking for this screen.

## Needs eyes — not statically checkable

`home-plan.md` closes with "not seen rendered", and that's still true. These need a browser:

- Chip strip wrapping at 360px once fixes #1 and #2 land — `max-w-[55%]` with 44px chips wraps a
  5-set exercise to two rows. May need the strip to move below the exercise name.
- Long session name in `DayHeader` at `text-[2rem]` (finding 15).
- Space Mono actually loading — everything numeric on the screen assumes it.
- The stamp at 200ms with `scale(1.3)` on a 4px-tall chip: whether it reads as a stamp or a flicker.
- Cream panels against the orange radial gradient in the body background.
- `app-safe-bottom` (5.5rem) clearance under the fixed nav with the muscle map as the last card.

Home sits behind the Supabase guard (`features/auth/auth-guard.tsx` exempts only `/login`), so this
needs real credentials or a temporary guard bypass — your call, not mine. `! npm run dev` when you
want to walk the six states.
