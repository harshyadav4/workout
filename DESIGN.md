# Design rules

Read this before any change a person can see.

A new feature must fit into the app. It must not sit on top of it. An app gets messy one reasonable feature at a time, so "add what was asked, where it is easiest" is the wrong default. Your job is to make the feature work and keep the screen calm.

The bar is a calm, mainstream, premium app, like Oura, WHOOP, Apple Fitness or Flighty. Loud, niche or AI-looking work gets rejected, even when it is distinctive.

## 1. Before you write code

Answer these five questions. Then tell the owner your answers in a few lines, and wait if question 5 says so.

1. **What is the person trying to do, and how often?** Every workout, every week, every month, or once.
2. **Can something that already exists do it?** If a row, sheet or card nearly does it, change that. Do not add a second way to do one thing.
3. **Where does it go?** Go down this ladder and stop at the first step that fits:
   1. A new value or option in an existing row or sheet.
   2. A new row in an existing group.
   3. A new panel inside an existing card on Progress or Intake.
   4. A new group on an existing page.
   5. A new sheet that opens from a row.
   6. A new page. Only with the owner's approval.
4. **What gets quieter, merged or removed to make room?** A screen at its limit (section 2) takes nothing new until something leaves it.
5. **Must the owner see it first?** Yes for a new page, a new kind of control, or any change to the first screen of Today. Make a complete local `.html` file in `design-preview/` that shows real screens, give its path, and wait for approval.

If a request breaks a rule here, do not silently obey and do not refuse. Name the rule, suggest the best place that keeps it, and let the owner choose. If the owner still wants the exception, build it and record it in section 8.

## 2. Limits for one screen

| Thing | Limit |
|---|---|
| Main button | 1 per view |
| Large heading | 1 per screen |
| Hero visual (the arc, one big number) | 1 per screen |
| Notice | 1 at a time. Page notices go inside `.one-notice`, which shows only the first. |
| Form left open on a page | None. Weight today on You is the only exception. Forms live in sheets. |
| Quiet action on a row | 1 (Skip, Move, Change). More actions go in the row's sheet. |
| Detail under a row's name | 1 line, up to 4 facts. Every other number goes in the sheet. |
| Dock | Full: 4 tabs and the Workout/Diet circle. Never add to it. |
| Progress and Intake | 3 cards are the only navigation. No tabs and no fourth card. New charts go inside a card. |

On Today, "Start workout" must stay on screen at 390×844 without scrolling.

## 3. How visible an action is

The more often people use something, the more visible it is. List a screen's actions by use before you choose how they look.

| How often | How it looks |
|---|---|
| Every session | The main button, or the whole row as the tap target |
| Weekly | A row in a group |
| Rarely | A row near the end of a list, or inside a sheet |
| Destructive | Quiet text at the foot of a sheet, and swipe on a row, always with Undo. Red appears only at the point of confirming. |

Delete must never look stronger than the common action near it. Sign out is used far more than delete, so it looks stronger.

## 4. The look

**Surfaces.** One level only. `.plaque` is a see-through surface in the page. `.plaque-solid` is for anything floating, such as menus, bars and bubbles. Nothing is boxed inside a surface: no card in a card, and no box around a single field.

**Colour.** Use tokens from `app/globals.css`, so that You → Theme reaches your work.

- The main button is plain `--primary`, through `<Button>`: white on Dark, black on Light. No gradient and no glow.
- Warm light (`--l1`, `--l2`, `--l3`, `text-brand`) marks progress and nothing else.
- A card on Progress or Intake keeps its colour for all its charts (`--s-*`, through `SectionColors`).
- Red means a limit was passed or something is being deleted.
- No hex colours in components. The allowed exceptions are the Google button and the chart colours already in `features/progress/chart-theme.tsx`.
- Colour must never be the only signal. Say "over" in words as well as in red.

**Type.** Text is Instrument Sans. Headings are Outfit through `font-heading`. `.font-heading` sets the weight and tracking in one place, so never add `font-bold` or `tracking-*` to a heading. Either font can change in You → Theme, so never rely on one font's width. No new sizes:

| Use | Class |
|---|---|
| Page heading | `font-heading text-[34px] leading-[1.08]` |
| Sheet title | `DialogTitle` as it is |
| Name of a saved thing in a list | `font-heading text-[23px] leading-tight` |
| Group title | The `title` of `ListGroup` |
| Row name | The `label` of `ListRow` |
| Row detail | The `hint` of `ListRow` |
| Row value | The `value` of `ListRow` |

Every number that changes gets `tabular-nums`.

**Motion.** Short, and only to show what changed. No endless animation, no large blur, and a reduced-motion rule for each animation.

**Never add:**
- Glowing buttons, gradient buttons or coloured shadows.
- Icons in tinted boxes or circles.
- Badges, pills or chips for information that can be plain text.
- A card or a coloured box to make something feel important.
- Emoji in the UI, or a decorative drawing or wallpaper.
- A tab bar inside a page to hide that a page has too much.
- A popup for something a row or a sheet can do.
- `font-display`, `font-extrabold`, or `.key` and `.well` used for decoration.

## 5. Use what exists

If a piece nearly fits, extend it. Do not write a near copy.

| You need | Use |
|---|---|
| A list of things | `ListGroup`, `ListRow`, `ListSwitch` in `components/ui/list.tsx` |
| A form or details behind a row | `ListSheetRow`, or `ListSheet` |
| Rows inside a sheet, or a sheet with nothing to save | `SheetRows`, `SheetDone` |
| A long sheet with a save button | `DRAWER_CONTENT`, `SHEET_FOOT` in `components/ui/dialog.tsx` |
| A choice of 2 to 4 | `Segmented`, with `quiet` when it sits above a main button |
| Text and number fields, or a list to pick from | `Input`, `NumberInput`, `ThemedSelect` |
| Swipe to delete, with Undo | `SwipeRow`, `usePendingRemoval`, `UndoBar` |
| Progress shown as a curve | `HorizonArc`, `ProgressArc` in `components/ui/progress-arc.tsx` |
| Progress shown as a bar | `Progress` |
| A one-line message | `.notice-line` |
| An explanation behind an ⓘ | `InfoNote` |
| A chart on Progress or Intake | `Panel`, `EmptyChart`, `ChartTooltip`, `CHART` in `features/progress/` |
| The cards on Progress or Intake, and the line above them | `RingCards`, `ProgressHero` |
| A meal's numbers | `MealLine`, `MealNumbers` in `features/diet/meal-numbers.tsx` |

Copy the idiom from `features/diet/diet-build.tsx`, `features/planner/plan-build.tsx`, `features/diet/diet-today.tsx` and `features/profile/`.

## 6. What every feature must also do

- **Empty state.** Say what this is and what to do, with one main button. Never show an empty box or a chart with no data.
- **Errors.** One plain sentence that says what to do next.
- **Undo.** Anything removed can come back for a few seconds.
- **Reach.** Every tap target is at least 44 px. Every icon button has an `aria-label`. Nothing is reachable only by swipe.
- **Sheets.** Escape and Back close a sheet. Closing by mistake must not lose much typing.
- **Everywhere.** It works in Dark and Light, at 320 px wide, for a guest and when signed in, and offline.
- **Speed.** A tap answers at once. Heavy charts go inside `Panel`, which draws them only near the screen.
- **Tour and sample data.** Keep every `data-tour` mark. If a tour stop describes this screen, update its words in `features/tour/tour-steps.ts`. Add the feature to `lib/demo-data.ts` or `lib/diet-demo.ts`, so the tour's sample shows it.
- **Words.** Short and plain, with the same word for one thing everywhere. Rank, Daily quest and [SYSTEM] stay.
- **Diet stays separate.** Diet code does not reach into workout code, except to read from it.
- **About.** If the feature changes what the app does, keep `app/about/content.ts` and `public/llms.txt` true.

## 7. Before you say it is done

1. Run `npx tsc --noEmit` and `npm run check`.
2. Look at the real screen on `localhost:3000`, in Firefox too, at 390×844 and at 320 wide, in Dark and in Light.
3. Look at it empty, and full of data.
4. In You → Theme, pick a background, a main button colour and another font. Check that the feature follows them and stays readable.
5. Check that nothing scrolls sideways.
6. Compare with how the screen looked before. **Is it as calm as it was?** If it got busier, go back to section 1.
7. In your report, say where the feature went, what became quieter or moved, and what you did not test.

## 8. Decisions and changes

Change this file only with the owner's approval, and in the same commit as the change it describes.

Decisions the owner has made:

- The main button stays plain white or black by default. `#FF5F00` was tried as the default and not chosen. Anyone can choose it in You → Theme.
- The colour is Dusk, with the white button.
- Headings are Outfit and text is Instrument Sans. Instrument Sans has no rupee sign, so the browser borrows one. The owner kept the font.
- Progress and Intake use 3 cards and no tabs. Science has no page of its own; it sits inside the cards.
- Delete stays quieter than Sign out.
- You is one list with bottom sheets.
- Red, yellow and green progress bars are gone. A bar turns red only past a limit.
