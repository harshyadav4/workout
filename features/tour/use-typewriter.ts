"use client";

import { useCallback, useEffect, useState } from "react";

/** About the pace of reading aloud: a 25-word step takes some 4 seconds. */
export const LETTERS_PER_SECOND = 35;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The guide's words, one letter at a time, as if it speaks them. Starts over
 * whenever the text changes. `finish` shows the rest at once (a tap on the
 * bubble); under reduced motion the whole text shows from the start.
 *
 * Only what is drawn types out: the caller keeps the full text for screen
 * readers and for the bubble's size, so nothing is read letter by letter and
 * the bubble never grows under the reader's eyes.
 */
export function useTypewriter(text: string, paused = false) {
  const [state, setState] = useState(() => ({ text, count: reducedMotion() ? text.length : 0 }));
  // A new text starts at 0 in the same render, not one frame later — or the
  // old step's full text would flash before the new one types.
  const count = state.text === text ? state.count : 0;
  if (state.text !== text) {
    setState({ text, count: reducedMotion() ? text.length : 0 });
  }

  const done = count >= text.length;

  useEffect(() => {
    if (done || paused) {
      return;
    }
    let frame = 0;
    const started = performance.now() - (count / LETTERS_PER_SECOND) * 1000;
    const tick = (time: number) => {
      const next = Math.min(text.length, Math.floor(((time - started) / 1000) * LETTERS_PER_SECOND));
      setState((current) => (current.text === text && current.count !== next ? { text, count: next } : current));
      if (next < text.length) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // `count` only seeds the start time; the loop owns it from there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, done, paused]);

  const finish = useCallback(() => setState({ text, count: text.length }), [text]);

  return { shown: text.slice(0, count), done, finish };
}
