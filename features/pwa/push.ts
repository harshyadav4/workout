"use client";

import { supabase } from "@/lib/supabase";

/*
 * Web Push for the rest alert: the part of the alert a locked phone can still
 * receive. The device hands its push address to the account
 * (`push_subscriptions`); each rest writes when to send (`rest_alerts`); the
 * Edge Function in supabase/functions sends it. Guests have no account to
 * hold either, so they keep the page timer alone.
 *
 * iPhone: only the app added to the Home Screen may subscribe (iOS 16.4+).
 * Android: the browser tab may too.
 */

/** Set once this device has a subscription on file, so a rest knows to schedule. */
const PUSH_KEY = "arise.push";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** True when a push subscription can be made here at all. */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(publicKey) &&
    Boolean(supabase) &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** True once this device subscribed (and has not unsubscribed since). */
export function pushSubscribed(): boolean {
  try {
    return window.localStorage.getItem(PUSH_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(on: boolean) {
  try {
    window.localStorage.setItem(PUSH_KEY, on ? "1" : "0");
  } catch {
    // Then the next rest asks the browser instead; see scheduleRestPush.
  }
}

/** The VAPID public key as the bytes `pushManager.subscribe` wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.padEnd(Math.ceil(base64url.length / 4) * 4, "=").replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

async function userId(): Promise<string | undefined> {
  if (!supabase) {
    return undefined;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id;
}

/**
 * Subscribe this device and put the subscription on the account. Returns
 * false when it cannot (no worker in development, guest, refused) — the
 * toggle still works with the page timer, it just says less.
 */
export async function subscribePush(): Promise<boolean> {
  if (!pushSupported() || !supabase || !publicKey) {
    return false;
  }
  const user = await userId();
  if (!user) {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      return false;
    }
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      return false;
    }
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ endpoint: json.endpoint, user_id: user, p256dh: json.keys.p256dh, auth: json.keys.auth });
    if (error) {
      console.warn("[push] could not save the subscription", error.message);
      return false;
    }
    remember(true);
    return true;
  } catch (error) {
    console.warn("[push] could not subscribe", error);
    return false;
  }
}

/** Drop this device's subscription, on the account and in the browser. */
export async function unsubscribePush(): Promise<void> {
  remember(false);
  if (!pushSupported() || !supabase) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
      await subscription.unsubscribe();
    }
    await cancelRestPush();
  } catch {
    // Nothing to undo that matters; the next subscribe starts clean.
  }
}

/** Ask the server to send "Rest done" at `endsAt` (ms). Replaces any earlier one. */
export async function scheduleRestPush(endsAt: number): Promise<void> {
  if (!supabase || !pushSubscribed()) {
    return;
  }
  const user = await userId();
  if (!user) {
    return;
  }
  const { error } = await supabase
    .from("rest_alerts")
    .upsert({ user_id: user, fire_at: new Date(endsAt).toISOString() });
  if (error) {
    console.warn("[push] could not schedule the rest alert", error.message);
  }
}

/** The rest was skipped, or it ended on screen: nothing to send. */
export async function cancelRestPush(): Promise<void> {
  if (!supabase || !pushSubscribed()) {
    return;
  }
  const user = await userId();
  if (!user) {
    return;
  }
  await supabase.from("rest_alerts").delete().eq("user_id", user);
}
