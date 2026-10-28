"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { commitNow, offerUndo } from "@/lib/undo";

/**
 * Delete-with-undo for a list on one screen. `remove(id, label, commit)` hides
 * the row at once and offers Undo; the real `commit` runs when the offer
 * settles (lib/undo). The list filters by `hidden`. Leaving the screen commits
 * what this screen offered, so a removal never evaporates with the page.
 */
export function usePendingRemoval() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const owner = useRef({}).current;

  useEffect(() => () => commitNow(owner), [owner]);

  const remove = useCallback(
    (id: string, label: string, commit: () => void) => {
      setHidden((current) => new Set(current).add(id));
      const reveal = () =>
        setHidden((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      offerUndo({
        label,
        owner,
        undo: reveal,
        // Once the data no longer has the row, the id can leave the set too.
        commit: () => {
          commit();
          reveal();
        }
      });
    },
    [owner]
  );

  return { hidden, remove };
}
