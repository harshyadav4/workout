// Sends "Rest done" to every device of every lifter whose rest has ended.
//
// Run by pg_cron every few seconds (README › Rest alerts). Each call: claim the
// due rows by deleting them first — two overlapping runs must never send twice
// — then push to each subscription of that user (../_shared/send.ts).
//
// Deployed with --no-verify-jwt: the caller is Postgres, not a user. The
// shared secret header is what gates it instead.
//
// Secrets (supabase secrets set): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto: or https: contact for the push service),
// CRON_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided.
import { createClient } from "npm:@supabase/supabase-js@2";

import { configurePush, env, sendToUsers } from "../_shared/send.ts";

/** How many rows one run takes. A gym app's load is far below this; the cap bounds a bad day. */
const BATCH = 200;

Deno.serve(async (request) => {
  if (request.headers.get("x-cron-secret") !== env("CRON_SECRET")) {
    return new Response("Forbidden", { status: 403 });
  }

  configurePush();
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });

  // Claim: delete and return in one statement, so a second run sees nothing.
  const { data: due, error } = await supabase
    .from("rest_alerts")
    .delete()
    .lte("fire_at", new Date().toISOString())
    .select("user_id, fire_at, body")
    .limit(BATCH);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return Response.json({ sent: 0 });
  }

  // The device wrote the body at rest start ("Next: Incline press, set 3 of 4, 8 × 60 kg").
  const bodyOf = new Map(due.map((row) => [row.user_id as string, row.body as string | null]));
  const result = await sendToUsers(
    supabase,
    [...bodyOf.keys()],
    (userId) => ({
      title: "Rest done",
      body: bodyOf.get(userId) || "Time for your next set.",
      tag: "rest",
      url: "/"
    }),
    // A rest alert ten minutes late is noise: let the push service drop it.
    { ttlSeconds: 600 }
  );

  return Response.json({ ...result, users: bodyOf.size });
});
