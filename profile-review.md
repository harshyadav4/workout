# Profile page — UI/UX review

Static review of `app/(app)/profile/page.tsx` and what it depends on:
`features/auth/use-auth.tsx`, `features/workout/{workout-store,supabase-sync}.tsx`, `lib/sync.ts`.
Method: `ui-ux-pro-max` (`--domain ux`, `--stack nextjs`), plus the rulings Home and Plan already
settled (44px floor, ink-on-colour, `Button` for anything tappable, visible labels over placeholders).

Contrast was measured and there is nothing to report: `text-muted-foreground` on `bg-secondary/50` is
**7.51:1**, `foreground` on the card is **17.68:1**, and the only control is a `Button`. Every tap
target passes — there is exactly one. The 12px uppercase labels are above the 10px problem Home #9
ruled on.

**So this review is not about how the page looks.** At 48 lines it is the smallest screen in the app
and it renders correctly. The findings are all about the fact that it is *inert*: two of its four
stats cannot be changed by any code path in the app, and its single action can fail without saying so.

**Status (2026-08-05): applied.** Done: #1, #2, #3, #4, #6, #7, #8 — plus the whole of
[body-metrics-plan.md](body-metrics-plan.md), which is what actually resolves #2. `heightCm` is now
editable and `setProfile` finally has callers. `tsc`, 9 test suites and `npm run build` all pass.

**Status (2026-08-26): closed out.** #5, #9 and the export half of #10 are done too, so every
finding above is now either fixed or explicitly declined below. `tsc`, `npm run check` and
`npm run build` all pass — `check` runs **eight** suites, not the nine the line above claims.

- **#5 — sync status.** `features/workout/sync-status.ts` is a module-level store held *outside* the
  workout store on purpose: `supabase-sync` subscribes to every change in that store, so writing
  status back into it would push, set state, and push again forever. Profile now renders
  "Synced at 14:32", or the failure. Time only, no date — the store resets on reload, so it is
  always today.

  **Building it surfaced a worse bug than the finding named.** `unsubscribe = store.subscribe(...)`
  is assigned inside `loadUserState().then()`, so a failed *load* never subscribes at all and that
  tab never pushes again for the rest of its life. That is terminal, not eventually-consistent like
  a failed push. So the two now read differently and offer different things: a failed push says it
  will go up with your next change and offers nothing, a failed load says nothing will be saved
  until this succeeds and offers **Retry**, which bumps an `attempt` counter in the effect deps.

  Retry is deliberately *not* offered on push failures. Re-running the effect re-reads, and
  `hydrateRemote` lets the remote copy win outright — it would throw away the very changes that
  failed to go up. The `flush()` early-return while `syncedRef` is undefined, which *What holds up*
  credits below, is untouched.

- **#9 — `next-themes` dropped.** `ThemeProvider` gone, `class="dark"` on `<html>`, dependency
  uninstalled. `suppressHydrationWarning` went with it: its only reason was next-themes mutating
  that class, and leaving it would hide real mismatches. No toggle — nothing asked for a light
  theme, and the tokens all live on bare `:root` with no `.dark` selector and not one `dark:`
  utility in the app, so the class is a formality that keeps `darkMode: ["class"]` honest.

- **#10 — export built, delete-account not.** *Export my data* writes the user's own half of the
  store to JSON. `buildExport` lives in `lib/sync.ts` and shares `snapshotState` with `pushChanges`
  so the two cannot drift; presets are filtered for the same reason `pushChanges` filters them, and
  `lib/sync.test.ts` pins that. Two things the type checker could not have caught: the object URL is
  **not** revoked in the same tick (that race cancels the download on iOS Safari, which is the
  browser this app is for) and the anchor is appended before the click, because a detached one does
  not fire there. `syncErrorMessage` reads the thrown value by shape rather than `instanceof Error`,
  and appends PostgREST's `hint` — its own docs say the actionable fix is usually there, not in
  `message`.

  **Delete-account is still open, on purpose.** The client SDK cannot delete a Supabase user, so it
  is either a truthfully-labelled "delete all my data" (wipe rows, clear localStorage, sign out) or
  a `security definer` RPC in a new migration that reaches `auth.users`. Materially different work,
  one of it schema that cannot be verified locally, and a destructive button under the wrong label
  costs more than it saves. It waits for that call.

One finding partly survives its own fix: `heightCm` is now editable but still has no consumer beyond
being displayed. It is recorded, not used.

## Critical

| # | Location | Problem | Smallest fix |
|---|---|---|---|
| 1 | `use-auth.tsx:59-61` + `profile/page.tsx:41` | **Sign out can fail silently.** `logout` is `await supabase?.auth.signOut()` — the returned `{ error }` is discarded. `signIn` directly above it (`:55-57`) checks and throws, so this is an inconsistency inside one object, not a house style. The page then calls `void logout()`: no `catch`, no pending state, no message. Offline, or with an expired refresh token, the button plays its `active:scale` and **nothing happens** — on a page whose only purpose is that button. The optional chain compounds it: if Supabase is unconfigured, `logout()` resolves *successfully* having done nothing at all. | Check the error and throw, as `signIn` does; give the button a pending state and surface the failure. |
| 2 | `workout-store.tsx:730` + `:151` | **Height and weight are unreachable, and default to a lie.** `setProfile` has **zero callers** — `grep -rn setProfile` returns the interface declaration, the omit-list, and the implementation. Nothing in any screen calls it. Meanwhile `heightCm`/`weightKg` have exactly two consumers app-wide: the two `<p>` tags on this page. Initial state is `heightCm: 0, weightKg: 0`, so a real new user is shown **"0 cm" and "0 kg" in bold 18px, presented as fact**. `seed-data.ts:1077-1078` sets 172/72 — so the seeded demo looks correct and only real accounts see the zeros. The data round-trips through localStorage and Supabase (`sync.ts:290-291`) to be displayed, and only displayed. | Make them editable — see *Bodyweight tracking* below, which is the real fix. Until then they should render `—`, not `0`. |

## Medium

| # | Location | Problem | Smallest fix |
|---|---|---|---|
| 3 | `profile/page.tsx:1` | **The only `"use client"` page in the app.** Home, Plan and Progress are all Server Components with the client leaf below them; this one marks the page itself, which is §Rendering's "Don't mark page as Client Component" by name. Low impact because `AppProviders` already makes every page client-rendered — but it is the one place the codebase contradicts its own pattern. | Extract a `ProfileDetails` client leaf, leave `page.tsx` a Server Component. |
| 4 | `workout-store.tsx:759` | **Profile can bleed across accounts on a shared device.** `hydrateRemote` replaces `sessionTemplates`, `scheduledSessions` and `logs` with `?? []`, but profile is `payload.profile ?? state.profile` — it *keeps the previous value*. Nothing clears `localStorage` on sign-out (`grep -rn removeItem` returns nothing), so if user B signs in on user A's device and has no `profiles` row yet, `profile.name` is still A's. It only surfaces when Google metadata lacks `full_name` (the page prefers that, `:24`) — narrow, but it is someone else's name on your profile. | `profile: payload.profile ?? EMPTY_PROFILE` in `hydrateRemote`, or clear the store key on sign-out. |
| 5 | `supabase-sync.tsx:68,87` | **Sync failures are console-only.** A failed push and a failed load both `console.error` and stop. The user is never told, and Profile — the page that would naturally carry account and sync state — shows nothing. On a local-first app that silently queues work, "is my data actually saved?" is the question this page should answer and doesn't. | A last-synced line on this card. Needs state lifted out of `SupabaseSync`, so it is not a one-liner. |
| 6 | `profile/page.tsx:29` vs `:24` | Name falls back to `"—"`; **email has no fallback** and renders an empty line. Same card, two rules. | `{user?.email || profile.email || "—"}` |
| 7 | `profile/page.tsx:24` | `user?.user_metadata?.full_name as string` — an unchecked cast on provider-controlled data. `user_metadata` is `Record<string, any>`; a non-string renders as garbage or crashes the `||` chain. | `typeof … === "string" ? … : undefined` |

## Low

| # | Location | Problem |
|---|---|---|
| 8 | `page.tsx:14` + `:17` | `MobileShell` renders "Profile / Athlete details", then `CardTitle` renders "Profile" again — the same duplication as Plan #24, in a page with one card. |
| 9 | `app-providers.tsx:12` | `ThemeProvider … forcedTheme="dark"` — a provider and a dependency for a value that never changes, with `darkMode: ["class"]` in Tailwind whose class can never flip. App-wide, not a Profile defect, but Profile is where a theme control would live if one were ever wanted. Either add the toggle or drop `next-themes` and put `class="dark"` on `<html>`. |
| 10 | — | No account actions beyond sign out: no export, no delete account. Worth knowing, not worth building today. |

## What holds up

- The name fallback chain is deliberate and its reason is written down at `page.tsx:23` — Google fills
  one of the two fields and the profiles trigger stores the same value.
- `useAuth` throws outside its provider rather than returning a half-null context.
- Sign-in redirects instead of popping a window, with the mobile reason in the comment (`use-auth.tsx:49`).
- **`SupabaseSync`'s failure design is genuinely careful** and worth stating, because finding #4 is
  only a display bleed rather than data loss *because* of it: `syncedRef` holds the last state
  Supabase is known to have, so a failed push is retried by the next change instead of skipped, and
  `flush()` returns early while `syncedRef` is undefined — which means a failed *load* can never push
  the previous user's local data up to the new user's account.

---

The fix for finding #2 — tracking bodyweight and tape measurements over time, with charts — outgrew
this review once measurements joined it. It lives in **[body-metrics-plan.md](body-metrics-plan.md)**:
one model for both, entry on Profile, charts on Progress inside the existing muscle drilldown.

## Needs eyes — not statically checkable

- Whether "0 cm / 0 kg" is what you actually see on a fresh account, or whether your own account has
  a seeded `profiles` row masking it. Finding #2 is read off the initial state, not a live account.
- Sign-out failure (#1) needs the network throttled to reproduce. So does the sync line (#5), and
  the load failure specifically needs the network down *at sign-in* — throttling it later hits the
  push path instead, which looks and offers something different.
- The account bleed (#4) needs two Google accounts on one device, and only shows when the second has
  no `full_name` in its metadata.

Profile sits behind the same Supabase guard as the rest, so all three need real credentials.
