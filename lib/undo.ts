import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * "Removed · Undo", the way a native list deletes: the row goes at once, and
 * for a few seconds a bar offers it back. The removal itself (`commit`) runs
 * when the bar times out, when a second removal replaces it, when the app
 * goes to the background, or when the screen that offered it goes away — so
 * nothing is ever lost by leaving. `undo` runs instead if the bar is tapped.
 * One offer at a time: the previous one is committed, not forgotten.
 */
export interface UndoOffer {
  id: number;
  label: string;
  undo: () => void;
  commit: () => void;
  /** Who offered it, so a screen can commit only its own on unmount. */
  owner?: object;
}

export const UNDO_MS = 5000;

const store = createStore<{ offer?: UndoOffer }>(() => ({}));
let timer: ReturnType<typeof setTimeout> | undefined;
let serial = 0;

function settle(how: "commit" | "undo") {
  const { offer } = store.getState();
  if (!offer) {
    return;
  }
  clearTimeout(timer);
  timer = undefined;
  store.setState({ offer: undefined });
  (how === "commit" ? offer.commit : offer.undo)();
}

export function offerUndo(input: Omit<UndoOffer, "id">) {
  settle("commit");
  const offer: UndoOffer = { id: ++serial, ...input };
  store.setState({ offer });
  timer = setTimeout(() => {
    if (store.getState().offer?.id === offer.id) {
      settle("commit");
    }
  }, UNDO_MS);
}

export function undoNow() {
  settle("undo");
}

/** Commit the standing offer — all of them, or only `owner`'s. */
export function commitNow(owner?: object) {
  const { offer } = store.getState();
  if (offer && (!owner || offer.owner === owner)) {
    settle("commit");
  }
}

export function useUndoOffer() {
  return useStore(store, (state) => state.offer);
}
