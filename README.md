# GymFlow

Production-oriented, mobile-first workout tracker built with Next.js App Router, TypeScript, Tailwind CSS, shadcn-style components, Firebase Auth + Firestore, and a lightweight Three.js muscle map.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style component structure
- Firebase Authentication (Google SSO)
- Firestore with offline persistence
- Three.js via `@react-three/fiber`
- Recharts for progress charts
- Zustand for fast local-first interaction state

## Mobile-first choices

- Bottom navigation for one-handed use
- Large tap targets and rounded cards
- Today’s workout is the default landing screen
- Fast increment controls for reps and weight
- Local-first store for low-latency edits
- Firestore IndexedDB persistence enabled in browser
- 3D body is lazy loaded and capped to low DPR

## Project structure

- `app/`
- `components/`
- `features/auth`
- `features/home`
- `features/workout`
- `features/planner`
- `features/progress`
- `lib/`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Fill these Firebase values in `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false
```

4. Start the app:

```bash
npm run dev
```

## Firebase setup

1. Create a Firebase project.
2. Enable Authentication:
   Use `Authentication -> Sign-in method -> Google`.
3. Create Firestore in production mode.
4. Add a web app in Firebase project settings and copy the config into `.env.local`.
5. In Firebase console, add your local dev origin and deployed domain to authorized domains.

## Firestore data shape

Each user writes under:

- `users/{uid}/workouts/templates`
- `users/{uid}/planner/weekly`
- `users/{uid}/logs/history`

Documents store arrays:

- `templates.items`
- `weekly.days`
- `history.items`

## Seed data

Preset muscles, workouts, and a starter weekly plan live in:

- `lib/seed-data.ts`

Export a static seed artifact with:

```bash
npm run seed
```

This writes:

- `public/seed-data.json`

## Notes

- Route protection is handled on the client via auth state guard.
- Firebase sync is debounced so tapping through sets stays responsive.
- The 3D body is intentionally low poly to stay mobile-safe.
