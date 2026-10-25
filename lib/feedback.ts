/**
 * The one moment: a click and a tap when a set is logged.
 *
 * Off by default. The web cannot ask for haptics the way a native app can, and
 * a phone that makes a noise in a gym without being asked is a phone that gets
 * muted. One switch on the You page turns both on, stored like the theme.
 *
 * The click is synthesised — two short sine blips, no audio file, nothing to
 * fetch. The tap is the vibrate API, which Android browsers honour and iOS
 * Safari ignores; feature-detected, never assumed.
 */

export const FEEDBACK_KEY = "gymflow.feedback";

export function feedbackEnabled(): boolean {
  try {
    return localStorage.getItem(FEEDBACK_KEY) === "on";
  } catch {
    return false;
  }
}

export function setFeedbackEnabled(on: boolean) {
  try {
    localStorage.setItem(FEEDBACK_KEY, on ? "on" : "off");
  } catch {
    // The choice still applies for this session; it just will not be remembered.
  }
}

let context: AudioContext | undefined;

function blip(at: number, hz: number, length: number, gain: number) {
  if (!context) {
    return;
  }
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(hz, at);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(amp).connect(context.destination);
  osc.start(at);
  osc.stop(at + length + 0.01);
}

/** A short, bright click. Must be called from a user gesture or it is silent. */
export function click() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return;
    }
    context ??= new Ctor();
    if (context.state === "suspended") {
      void context.resume();
    }
    const now = context.currentTime;
    blip(now, 1320, 0.045, 0.18);
    blip(now + 0.05, 1760, 0.06, 0.14);
  } catch {
    // No audio is not an error worth surfacing.
  }
}

export function tap(ms = 12) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(ms);
  }
}

/** Called on every newly logged set. Does nothing until the switch is on. */
export function logSetFeedback() {
  if (!feedbackEnabled()) {
    return;
  }
  click();
  tap(12);
}
