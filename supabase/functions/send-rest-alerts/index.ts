// Sends "Rest done" to every device of every lifter whose rest has ended.
//
// Run by pg_cron every few seconds (README › Rest alerts). Each call: claim the
// due rows by deleting them first — two overlapping runs must never send twice
// — then push to each subscription of that user. A subscription the push
// service reports gone (404 / 410) is removed, so dead devices do not pile up.
//
// Deployed with --no-verify-jwt: the caller is Postgres, not a user. The
// shared secret header is what gates it instead.
//
// Secrets (supabase secrets set): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto: or https: contact for the push service),
// CRON_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
};

/** How many rows one run takes. A gym app's load is far below this; the cap bounds a bad day. */
const BATCH = 200;

const PAYLOAD = JSON.stringify({
  title: "Rest done",
  body: "Time for your next set.",
  tag: "rest",
  url: "/"
});

Deno.serve(async (request) => {
  if (request.headers.get("x-cron-secret") !== env("CRON_SECRET")) {
    return new Response("Forbidden", { status: 403 });
  }

  webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });

  // Claim: delete and return in one statement, so a second run sees nothing.
  const { data: due, error } = await supabase
    .from("rest_alerts")
    .delete()
    .lte("fire_at", new Date().toISOString())
    .select("user_id, fire_at")
    .limit(BATCH);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return Response.json({ sent: 0 });
  }

  const users = [...new Set(due.map((row) => row.user_id as string))];
  const { data: subscriptions, error: subError } = await supabase
    .from("push_subscriptions")
    .select("endpoint, user_id, p256dh, auth")
    .in("user_id", users);
  if (subError) {
    return Response.json({ error: subError.message }, { status: 500 });
  }

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    (subscriptions ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          PAYLOAD,
          // A rest alert ten minutes late is noise: let the push service drop it.
          { TTL: 600, urgency: "high" }
        );
        sent += 1;
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          gone.push(sub.endpoint);
        } else {
          console.error("push failed", sub.endpoint, status, (cause as Error).message);
        }
      }
    })
  );
  if (gone.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", gone);
  }

  return Response.json({ sent, removed: gone.length, users: users.length });
});
