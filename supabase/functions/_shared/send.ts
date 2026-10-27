// Web Push to every device of a set of users, shared by the two senders.
//
// A subscription the push service reports gone (404 / 410) is deleted, so dead
// devices do not pile up. Errors on one device never stop the others.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

export const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
};

/** Reads the VAPID secrets once per invocation. */
export function configurePush() {
  webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
}

export interface PushCard {
  title: string;
  body: string;
  /** Replaces an earlier card with the same tag. */
  tag: string;
  /** Where a tap lands. */
  url: string;
}

interface Subscription {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends `cardFor(userId)` to each device of each user. Returns how many went
 * and how many dead subscriptions were removed.
 */
export async function sendToUsers(
  supabase: SupabaseClient,
  userIds: string[],
  cardFor: (userId: string) => PushCard | undefined,
  options: { ttlSeconds: number }
): Promise<{ sent: number; removed: number }> {
  if (userIds.length === 0) {
    return { sent: 0, removed: 0 };
  }
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, user_id, p256dh, auth")
    .in("user_id", userIds);
  if (error) {
    throw error;
  }

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    ((data ?? []) as Subscription[]).map(async (sub) => {
      const card = cardFor(sub.user_id);
      if (!card) {
        return;
      }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(card),
          { TTL: options.ttlSeconds, urgency: "high" }
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
  return { sent, removed: gone.length };
}
