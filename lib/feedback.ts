/**
 * Feedback: a light haptic on every tap, and a click when a set is logged.
 *
 * Off by default. The web cannot ask for haptics the way a native app can, and
 * a phone that makes a noise in a gym without being asked is a phone that gets
 * muted. One switch on the You page turns both on, stored like the theme. The
 * taps are caught in one place, components/layout/tap-feedback.tsx.
 *
 * The click is synthesised — two short sine blips, no audio file, nothing to
 * fetch. The haptic is the vibrate API on Android, and on iPhone a hidden
 * native switch (see `haptic`); feature-detected, never assumed.
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

/** Marks the hidden switch, so the tap listener does not answer its own click. */
export const HAPTIC_SWITCH_ATTR = "data-haptic-switch";

let hapticSwitch: HTMLLabelElement | undefined;

/**
 * One light tap. Must be called from a user gesture.
 *
 * Android: the vibrate API. iPhone Safari has no vibrate, but since iOS 18 a
 * native `<input type="checkbox" switch>` plays the system haptic when it
 * flips — so a hidden one is flipped through its label. That is a side effect,
 * not an API: on older iOS, or if Apple changes it, the tap is simply silent.
 */
export function haptic(ms = 12) {
  if (typeof navigator === "undefined") {
    return;
  }
  if ("vibrate" in navigator) {
    navigator.vibrate(ms);
    return;
  }
  try {
    if (!hapticSwitch) {
      hapticSwitch = document.createElement("label");
      hapticSwitch.setAttribute(HAPTIC_SWITCH_ATTR, "");
      hapticSwitch.setAttribute("aria-hidden", "true");
      hapticSwitch.style.cssText =
        "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      hapticSwitch.appendChild(input);
      document.body.appendChild(hapticSwitch);
    }
    hapticSwitch.click();
  } catch {
    // No haptic is not an error worth surfacing.
  }
}

/**
 * Called on every newly logged set. Does nothing until the switch is on. The
 * haptic for that tap already came from the tap listener; this adds the sound.
 */
export function logSetFeedback() {
  if (!feedbackEnabled()) {
    return;
  }
  click();
}
