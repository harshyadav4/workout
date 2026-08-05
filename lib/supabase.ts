import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False until the env vars land, so the UI can say so instead of throwing. */
export const isSupabaseConfigured = Boolean(url && anonKey);

// ponytail: plain supabase-js, not @supabase/ssr. That package exists to share
// the session with server components and middleware; this app has neither —
// every screen is a client component behind AuthGuard. supabase-js persists the
// session to localStorage on its own. Add @supabase/ssr the day a server
// component needs to read the user.
//
// The anon key is public by design: RLS decides what it can reach (see
// supabase/migrations/0001_init.sql).
export const supabase = isSupabaseConfigured ? createClient(url!, anonKey!) : null;
