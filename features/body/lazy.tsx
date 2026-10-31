"use client";

import dynamic from "next/dynamic";

import type { BodyMapProps } from "@/features/body/body-map-shared";

/**
 * The body map's two drawings, loaded when first drawn rather than with the
 * page. The back alone is 130 KB of paths, and with a plain import the
 * bundler copied the pair into Today's, Plan's and Progress's own chunks —
 * 57 KB (gzip) on each first load, three times over in the installed app.
 * One lazy chunk is fetched once and shared. The server still renders the
 * drawing into the HTML, so the first load does not jump. A client-side tab
 * change renders before the chunk is in, so a box the drawing's height stands
 * in until then — without it the card collapsed and sprang open a beat later.
 */
const Placeholder = () => <div className="mx-auto h-[16.5rem] w-auto" aria-hidden />;

/**
 * The chunk could not load: no signal, and the app has not saved it yet
 * (public/sw.js saves it once per release). One plain line says so. The box above
 * only stands in while loading, and left alone it stayed as a blank space.
 */
const MapNeedsInternet = (_props: BodyMapProps) => (
  <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">
    The muscle map needs the internet the first time.
  </p>
);
/** Front says it. Saying it again a few pixels across would be noise. */
const NoDrawing = (_props: BodyMapProps) => null;

export const FrontBody = dynamic<BodyMapProps>(
  () => import("@/features/body/front").catch(() => ({ default: MapNeedsInternet })),
  { loading: Placeholder }
);
export const BackBody = dynamic<BodyMapProps>(
  () => import("@/features/body/back").catch(() => ({ default: NoDrawing })),
  { loading: Placeholder }
);
