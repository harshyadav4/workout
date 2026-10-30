"use client";

import type { ReactNode } from "react";

import { useArea } from "@/features/diet/area-store";

/** One page, two halves: only the side in use is mounted, so neither runs behind the other. */
export function AreaView({ workout, diet }: { workout: ReactNode; diet: ReactNode }) {
  return <>{useArea() === "diet" ? diet : workout}</>;
}
